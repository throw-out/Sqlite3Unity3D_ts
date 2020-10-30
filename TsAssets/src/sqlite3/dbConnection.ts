import * as CS from "csharp";
import { DBCommand } from "./dbCommand";
import { DBMapping } from "./dbMapping";
import { DBTable } from "./dbTable";
import { Orm } from "./orm";


class DBConnection {
    //Mapping
    private _mappings: WeakMap<Object, DBMapping>;
    private _mappingSet: Set<DBMapping>;
    //连接实例
    private _handle: CS.Mono.Data.Sqlite.SqliteConnection;
    //连接信息
    private _datapath: string;
    private _password: string;
    //已经连接数据库
    private _opened: boolean = false;
    //打印信息
    private _trace: boolean = false;
    //事务信息
    private _transactionDepth: number = 0;

    //Getter 丶 Setter
    get handle() { return this._handle; }
    get datapath() { return this._datapath; }
    get password() { return this._password; }
    get opened() { return this._opened; }
    get trace() { return this._trace; }
    set trace(val: boolean) { this._trace = val; }

    constructor(path: string, password?: string) {
        if (!CS.System.IO.File.Exists(path))
            throw new Error("FileNotFoundException: " + path);
        this._opened = false;
        this._datapath = path;
        this._password = password;
    }
    open() {
        if (!this._opened || !this._handle) {
            if (!CS.System.IO.File.Exists(this._datapath))
                throw new Error("FileNotFoundException: " + this._datapath);
            //Connect
            this._handle = new CS.Mono.Data.Sqlite.SqliteConnection("DATA SOURCE=" + this._datapath);
            if (this._password && this._password.length > 0)
                this._handle.SetPassword(this._password);
            //Opne
            this._handle.Open();
            this._opened = true;
        }
    }
    close() {
        if (this._opened && this._handle) {
            try {
                this._handle.Close();
                this._handle.Dispose();
            }
            finally {
                this._opened = false;
                this._handle = null;
            }
        }
    }
    dispose() {
        let set = this._mappingSet;
        if (set) {
            for (let map of set) {
                map.dispose();
            }
        }
        this.close();
        this._mappings = null;
        this._mappingSet = null;
    }
    changePassword(password: string) {
        if (!this.opened)
            throw new Error("Cannot create commands from unopened database");

        this._handle.ChangePassword(password);
        this._password = password;
    }

    //#region  创建表丶删除表丶清空表
    createTable(proto: any) {
        let map = this.getMapping(proto);
        let query = `CREATE TABLE IF NOT EXISTS "${map.tableName}"(\n)`;
        for (let i = 0; i < map.columns.length; i++) {
            if (i >= 0) query += ",\n";
            query += Orm.sqlDecl(map.columns[i]);
        }
        query += ")";

        return this.executeUpdate(query);
    }
    dropTable(proto: any) {
        let map = this.getMapping(proto);
        let query = `DROP TABLE IF EXISTS "${map.tableName}"`;
        return this.executeUpdate(query);
    }
    clearTable(proto: any) {
        let map = this.getMapping(proto);
        let query = `DELETE FROM "${map.tableName}"`;
        return this.executeUpdate(query);
    }
    //#endregion

    //#region 事务
    runInTransaction(action: Function) {
        try {
            let point = this.savePoint();
            action();
            this.release(point);
        }
        catch (e) {
            this.rollback();
            throw e;
        }
    }
    beginTransaction() {
        if (this._transactionDepth == 0) {
            this._transactionDepth = 1;
            this.executeUpdate("BEGIN TRANSACTION");
        }
        throw new Error("InvalidOperationException: Cannot begin a transaction while already in a transaction.");
    }
    commit() {
        if (this._transactionDepth > 0) {
            this._transactionDepth = 0;
            this.executeUpdate("COMMIT");
        }
    }
    rollback(savepoint?: string) {
        if (savepoint)
            this.doPoint(savepoint, "ROLLBACK TO");
        else
            this.executeUpdate("ROLLBACK");
    }
    release(savepoint: string) {
        this.doPoint(savepoint, "RELEASE");
    }
    private savePoint() {
        let depth = this._transactionDepth++;
        let point = "S" + parseInt((Math.random() * 100000).toString()) + "D" + depth;
        this.executeUpdate("SAVEPOINT " + point);
        return point;
    }
    private doPoint(savepoint: string, cmd: string) {
        let first_len = savepoint.indexOf("D");
        if (first_len >= 2 && savepoint.length > first_len + 1) {
            let depth = parseInt(savepoint.substring(first_len + 1));
            if (depth >= 0 && depth < this._transactionDepth) {
                this._transactionDepth = depth;
                this.executeUpdate(cmd.trim() + " " + savepoint);
                return;
            }
        }
        throw new Error("ArgumentException: savePoint is not valid, and should be the result of a call to SaveTransactionPoint.");
    }
    //#endregion

    //#region 查询记录
    table<T>(proto: T) {
        return new DBTable<T>(this, this.getMapping(proto))
    }
    get<T>(proto: T, pk: any) {
        let map = this.getMapping(proto);
        let result = this.executeQuery<T>(proto, map.getByPrimaryKeySql, pk);
        return result.length > 0 ? result[0] : null;
    }
    lastInsertRowid(proto: any) {
        var cmd = this.createCommand("");
        return cmd.lastInserRowid(this.getMapping(proto));
    }
    //#endregion


    //#region 插入记录
    insert(obj: any): number {
        return this._insert(obj, "", this.getMapping(Object.getPrototypeOf(obj)));
    }
    insertOrReplace(obj: any): number {
        return this._insert(obj, "OR REPLACE", this.getMapping(Object.getPrototypeOf(obj)));
    }
    insertAll(objs: Array<any>): number {
        if (!objs || objs.length == 0)
            return 0;
        return this._insertAll(objs, "", this.getMapping(Object.getPrototypeOf(objs[0])));
    }
    private _insertAll(objs: Array<any>, extra: "" | "OR REPLACE", map: DBMapping): number {
        if (!objs || !map)
            return 0;

        let count = 0;
        try {
            this.runInTransaction(() => {
                objs.forEach(obj => {
                    count += this._insert(obj, extra, map);
                });
            });
        } finally {
            map.dispose();
        }
        return count;
    }
    private _insert(obj: any, extra: "" | "OR REPLACE", map: DBMapping): number {
        if (!obj || !map)
            return 0;

        let replacing = extra === "OR REPLACE";

        let cols = replacing ? map.insertOrReplaceColumns : map.insertColumns;
        let vals = new Array<any>();
        for (let col of cols)
            vals.push(obj[col.prop]);

        let cmd = map.getInsertCommand(this, extra ?? "");
        let count = cmd.executeUpdate(vals);

        if (map.pk && map.pk.autoInc) {
            obj[map.pk.prop] = this.lastInsertRowid(map.proto);
        }

        return count;
    }
    //#endregion

    executeUpdate(query: string, ...args: any[]): number {
        let command = this.createCommand(query, ...args);
        return command.executeUpdate();
    }
    executeQuery<T>(proto: any, query: string, ...args: any[]): Array<T> {
        let command = this.createCommand(query, ...args);
        return command.executeQuery<T>(this.getMapping(proto));
    }
    newCommand(): DBCommand {
        if (!this.opened)
            throw new Error("Cannot create commands from unopened database");
        return new DBCommand(this);
    }
    createCommand(query: string, ...args: any[]): DBCommand {
        var command = this.newCommand();
        command.commandText = query;
        args.forEach(val => command.bind(val));

        return command;
    }
    //Mapping
    getMappingForce(proto: any): DBMapping {
        return new DBMapping(proto);
    }
    getMapping(proto: any): DBMapping {
        if (!this._mappings) {
            this._mappings = new WeakMap();
            this._mappingSet = new Set();
        }
        let map = this._mappings.get(proto);
        if (!map) {
            map = new DBMapping(proto);
            //校验当前数据库信息
            if (this.proofTestTable(map)) {
                this._mappings.set(proto, map);
                this._mappingSet.add(map);
            }
        }
        return map;
    }
    //校验当前数据表
    proofTestTable(map: DBMapping) {
        //尝试创建表
        let create_sql = "CREATE TABLE IF NOT EXISTS \"" + map.tableName + "\"(\n";
        for (let i = 0; i < map.columns.length; i++) {
            if (i > 0) create_sql += ",\n";
            create_sql += Orm.sqlDecl(map.columns[i]);
        }
        create_sql += ")";
        this.executeUpdate(create_sql);
        //从数据库拉取表信息<与当前表比对字段信息>
        let command = this.createCommand("SELECT sql FROM sqlite_master WHERE type = \"table\" AND name = ? ;", map.tableName);
        let exists_sql = command.executeScalar<string>("string");
        //比对表的差异性 
        let create_cols = this.proofColumns(create_sql);
        let exists_cols = this.proofColumns(exists_sql);
        let add_cols: Array<string> = new Array();
        let rebuild = create_cols.length < exists_cols.length;
        for (let i = 0; i < create_cols.length && !rebuild; i++) {
            let col1 = create_cols[i];
            if (i < exists_cols.length) {
                let col2 = exists_cols[i];
                if (col1.name !== col2.name || col1.content !== col2.content)
                    rebuild = true;
            } else
                add_cols.push(col1.content);
        }
        //重构表
        if (rebuild) {
            //寻找相同字段<继承>
            let samecols: string = undefined;
            for (let i = 0; i < create_cols.length; i++) {
                for (let j = 0; j < exists_cols.length; j++) {
                    if (create_cols[i].name === exists_cols[j].name) {
                        if (samecols) samecols += ",";
                        samecols += "\"" + create_cols[i].name + "\"";
                        break;
                    }
                }
            }
            //创建临时表->迁移相同字段数据->删除临时表
            this.runInTransaction(() => {
                let table_name = map.tableName;
                let table_temp = map.tableName + "_temp";
                this.executeUpdate(`PRAGMA foreign_keys = off;`);
                this.executeUpdate(`DROP TABLE IF EXISTS \"${table_temp}\" ;`);
                this.executeUpdate(`CREATE TABLE \"${table_temp}\" AS SELECT * FROM \"${table_name}\" ;`);
                this.executeUpdate(`DROP TABLE \"${table_name}\" ;`);
                this.executeUpdate(create_sql);
                if (samecols)
                    this.executeUpdate(`INSERT INTO \"${table_name}\" ( ${samecols} ) SELECT ${samecols} FROM \"${table_temp}\";`);
                this.executeUpdate(`DROP TABLE \"${table_temp}\" ;`);
                this.executeUpdate(`PRAGMA foreign_keys = on;`);

                console.warn(`column exception, rebuild sql: ${table_name}\n${create_sql}`);
            });
        }
        //表追加字段
        else if (add_cols && add_cols.length > 0) {
            this.runInTransaction(() => {
                let table_name = map.tableName;
                for (var col of add_cols) {
                    this.executeUpdate(`ALTER TABLE \"${table_name}\" ADD COLUMN ${col} ;`);
                    console.warn(`Alter table add column ${table_name}:${col}`);
                }
            });
        }

        return true;
    }
    proofColumns(sql: string) {
        if (!sql)
            throw new Error("Can't create a TableMapping instance, sql: " + sql);
        let i1 = sql.indexOf("(");
        let i2 = sql.indexOf(")");
        sql = sql.substring(i1 + 1, i2).replace("\n", "").replace("\r", "");

        //console.log(sql);
        let fields: Array<{ name: string, content: string }> = new Array();
        for (let col of sql.split(",")) {
            col = col.trim();
            if (col.startsWith("\"")) {
                i2 = col.indexOf("\" ");
                col = col.substring(1, i2) + col.substring(i2 + 1);
            }
            i2 = col.indexOf(" ");
            fields.push({
                name: col.substring(0, i2),
                content: col
            });
        }
        return fields;
    }
    static createFile(path: string, del_exists?: boolean): boolean {
        let exists = CS.System.IO.File.Exists(path);
        if (!exists || del_exists) {
            if (exists)
                CS.System.IO.File.Delete(path);
            CS.Mono.Data.Sqlite.SqliteConnection.CreateFile(path);
            return true;
        }
        return false;
    }
}

export { DBConnection };