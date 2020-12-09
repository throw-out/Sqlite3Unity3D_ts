import * as CS from "csharp";
import { DBCommand } from "./dbCommand";
import { DBMapping } from "./dbMapping";
import { DBQuery } from "./dbQuery";
import { Orm } from "./orm";

type Type<T> = { new(...args: any[]): T };

/**连接实例 */
class DBConnection {
    //Mapping
    private _mappings: WeakMap<Type<object>, DBMapping>;
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
            set.forEach(mapping => mapping.dispose());
        }
        this.close();
        this._mappings = null;
        this._mappingSet = null;
    }
    changePassword(password: string) {
        if (!this._opened)
            throw new Error("Cannot create commands from unopened database");

        this._handle.ChangePassword(password);
        this._password = password;
    }

    //#region  创建表丶删除表丶清空表
    createTable(type: Type<object>) {
        let mapping = this.getMapping(type);
        let query = `CREATE TABLE IF NOT EXISTS "${mapping.tableName}"(\n)`;
        for (let i = 0; i < mapping.columns.length; i++) {
            if (i >= 0) query += ",\n";
            query += Orm.sqlDecl(mapping.columns[i]);
        }
        query += ")";

        return this.executeUpdate(query);
    }
    dropTable(type: Type<object>) {
        let mapping = this.getMapping(type);
        let query = `DROP TABLE IF EXISTS "${mapping.tableName}"`;
        return this.executeUpdate(query);
    }
    clearTable(type: Type<object>) {
        let mapping = this.getMapping(type);
        let query = `DELETE FROM "${mapping.tableName}"`;
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
    binding<T extends object>(type: Type<T>) {
        return new DBConnectionBinding<T>(this, type);
    }
    table<T extends object>(type: Type<T>) {
        return new DBQuery<T>(this, this.getMapping(type))
    }
    get<T extends object>(type: Type<T>, pk: any) {
        let mapping = this.getMapping(type);
        let result = this.executeQuery<T>(type, mapping.getByPrimaryKeySql, pk);
        return result.length > 0 ? result[0] : null;
    }
    lastInsertRowid(type: Type<object>) {
        var cmd = this.createCommand("");
        return cmd.lastInserRowid(this.getMapping(type));
    }
    //#endregion


    //#region 插入记录
    insert(obj: any): number {
        let proto = Object.getPrototypeOf(obj);
        return this._insert(obj, "", this.getMapping(proto.constructor));
    }
    insertOrReplace(obj: any): number {
        let proto = Object.getPrototypeOf(obj);
        return this._insert(obj, "OR REPLACE", this.getMapping(proto.constructor));
    }
    insertAll(objs: Array<any>): number {
        if (!objs || objs.length == 0)
            return 0;
        let proto = Object.getPrototypeOf(objs[0]);
        return this._insertAll(objs, "", this.getMapping(proto.constructor));
    }
    private _insertAll(objs: Array<any>, extra: "" | "OR REPLACE", mapping: DBMapping): number {
        if (!objs || !mapping)
            return 0;

        let count = 0;
        try {
            this.runInTransaction(() => {
                objs.forEach(obj => {
                    count += this._insert(obj, extra, mapping);
                });
            });
        } finally {
            mapping.dispose();
        }
        return count;
    }
    private _insert(obj: any, extra: "" | "OR REPLACE", mapping: DBMapping): number {
        if (!obj || !mapping)
            return 0;

        let replacing = extra === "OR REPLACE";

        let cols = replacing ? mapping.insertOrReplaceColumns : mapping.insertColumns;
        let vals = new Array<any>();
        for (let col of cols)
            vals.push(obj[col.prop]);

        let cmd = mapping.getInsertCommand(this, extra ?? "");
        let count = cmd.executeUpdate(vals);

        if (mapping.pk && mapping.pk.autoInc) {
            obj[mapping.pk.prop] = this.lastInsertRowid(mapping.Type);
        }

        return count;
    }
    //#endregion

    executeUpdate(query: string, ...args: any[]): number {
        let command = this.createCommand(query, ...args);
        return command.executeUpdate();
    }
    executeQuery<T extends object>(type: Type<T>, query: string, ...args: any[]): Array<T> {
        let command = this.createCommand(query, ...args);
        return command.executeQuery<T>(this.getMapping(type));
    }
    newCommand(): DBCommand {
        if (!this._opened)
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
    private getMapping(type: Type<object>): DBMapping {
        if (typeof (type) !== "function")
            throw new Error("ctor is not constructor:" + type);

        if (!this._mappings) {
            this._mappings = new WeakMap();
            this._mappingSet = new Set();
        }
        let mapping = this._mappings.get(type);
        if (!mapping) {
            mapping = new DBMapping(type);
            //校验当前数据库信息
            if (this.proofTable(mapping)) {
                this._mappings.set(type, mapping);
                this._mappingSet.add(mapping);
            }
        }
        return mapping;
    }
    /**校验当前数据表 */
    private proofTable(mapping: DBMapping) {
        //尝试创建表
        let create_sql = "CREATE TABLE IF NOT EXISTS \"" + mapping.tableName + "\"(\n";
        for (let i = 0; i < mapping.columns.length; i++) {
            if (i > 0) create_sql += ",\n";
            create_sql += Orm.sqlDecl(mapping.columns[i]);
        }
        create_sql += ")";
        this.executeUpdate(create_sql);
        //从数据库拉取表信息<与当前表比对字段信息>
        let command = this.createCommand("SELECT sql FROM sqlite_master WHERE type = \"table\" AND name = ? ;", mapping.tableName);
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
            let samecols: string = "";
            for (let i = 0; i < create_cols.length; i++) {
                for (let j = 0; j < exists_cols.length; j++) {
                    if (create_cols[i].name === exists_cols[j].name) {
                        if (samecols.length > 0) samecols += ",";
                        samecols += "\"" + create_cols[i].name + "\"";
                        break;
                    }
                }
            }
            //创建临时表->迁移相同字段数据->删除临时表
            this.runInTransaction(() => {
                let table_name = mapping.tableName;
                let table_temp = mapping.tableName + "_temp";
                this.executeUpdate(`PRAGMA foreign_keys = off;`);
                this.executeUpdate(`DROP TABLE IF EXISTS \"${table_temp}\" ;`);
                this.executeUpdate(`CREATE TABLE \"${table_temp}\" AS SELECT * FROM \"${table_name}\" ;`);
                this.executeUpdate(`DROP TABLE \"${table_name}\" ;`);
                this.executeUpdate(create_sql);
                if (samecols.length > 0)
                    this.executeUpdate(`INSERT INTO \"${table_name}\" ( ${samecols} ) SELECT ${samecols} FROM \"${table_temp}\";`);
                this.executeUpdate(`DROP TABLE \"${table_temp}\" ;`)
                this.executeUpdate(`PRAGMA foreign_keys = on;`);

                console.warn(`column exception, rebuild sql: ${table_name}\n${create_sql}`);
            });
        }
        //表追加字段
        else if (add_cols && add_cols.length > 0) {
            this.runInTransaction(() => {
                let table_name = mapping.tableName;
                for (var col of add_cols) {
                    this.executeUpdate(`ALTER TABLE \"${table_name}\" ADD COLUMN ${col} ;`);
                    console.warn(`Alter table add column ${table_name}:${col}`);
                }
            });
        }

        return true;
    }
    /**从sql dll语句解析字段信息 */
    private proofColumns(sql: string) {
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

/**绑定构造函数的连接实例 */
class DBConnectionBinding<T extends object> {
    private _conn: DBConnection;
    private _type: Type<T>;
    //Getter 丶 Setter
    get handle() { return this._conn.handle; }
    get datapath() { return this._conn.datapath; }
    get password() { return this._conn.password; }
    get opened() { return this._conn.opened; }
    get trace() { return this._conn.trace; }
    set trace(val: boolean) { this._conn.trace = val; }
    get connection() { return this._conn; }

    constructor(conn: DBConnection, type: Type<T>) {
        this._conn = conn;
        this._type = type;
    }
    open() {
        this._conn.open();
    }
    close() {
        this._conn.close();
    }
    dispose() {
        this._conn.dispose();
    }
    changePassword(password: string) {
        this._conn.changePassword(password);
    }
    createTable() {
        return this._conn.createTable(this._type);
    }
    dropTable() {
        return this._conn.dropTable(this._type);
    }
    clearTable() {
        return this._conn.clearTable(this._type);
    }
    runInTransaction(action: Function) {
        this._conn.runInTransaction(action);
    }
    beginTransaction() {
        this._conn.beginTransaction();
    }
    commit() {
        this._conn.commit();
    }
    rollback(savepoint?: string) {
        this._conn.rollback(savepoint);
    }
    release(savepoint: string) {
        this._conn.release(savepoint);
    }

    table() {
        return this._conn.table<T>(this._type);
    }
    get(pk: any) {
        return this._conn.get<T>(this._type, pk);
    }
    lastInsertRowid() {
        return this._conn.lastInsertRowid(this._type);
    }
    insert(obj: any) {
        return this._conn.insert(obj);
    }
    insertOrReplace(obj: any) {
        return this._conn.insertOrReplace(obj);
    }
    insertAll(obj: Array<any>) {
        return this._conn.insertAll(obj);
    }

    executeUpdate(query: string, ...args: any[]) {
        return this._conn.executeUpdate(query, ...args);
    }
    executeQuery(query: string, ...args: any[]) {
        return this._conn.executeQuery<T>(this._type, query, ...args);
    }

    newCommand(): DBCommand {
        return this._conn.newCommand();
    }
    createCommand(query: string, ...args: any[]): DBCommand {
        return this._conn.createCommand(query, ...args);
    }

    static createFile(path: string, del_exists?: boolean): boolean {
        return DBConnection.createFile(path, del_exists);
    }
}

export {
    DBConnection,
    DBConnectionBinding
};