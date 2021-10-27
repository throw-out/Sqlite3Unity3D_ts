import * as CS from "csharp";
import { DBCommand } from "./DBCommand";
import { DBMapping } from "./DBMapping";
import { DBQuery } from "./DBQuery";
import { Orm } from "./Orm";

type Type<T> = { new(...args: any[]): T };

/**连接实例 */
export class DBConnection {
    //Mapping
    private _mappings: WeakMap<Type<object>, DBMapping>;
    private _mappingSet: Set<DBMapping>;
    //连接实例
    private _handle: CS.SQLite.SQLiteConnection;
    //连接信息
    private _datapath: string;
    //已经连接数据库
    private _opened: boolean = false;
    //打印信息
    private _trace: boolean = false;
    //事务信息
    private _transactionDepth: number = 0;
    //Getter 丶 Setter
    public get handle() { return this._handle; }
    public get datapath() { return this._datapath; }
    public get opened() { return this._opened; }
    public get trace() { return this._trace; }
    public set trace(val: boolean) { this._trace = val; }
    //更新过的表
    public get inMemory() { return this._inMemory; }
    public get updateTables() { return this._updateTables; }
    private _updateTables: string[];
    private _inMemory: boolean;

    constructor(path: string) {
        if (!CS.System.IO.File.Exists(path))
            throw new Error("FileNotFoundException: " + path);
        this._opened = false;
        this._datapath = path;
    }
    public open(memory?: boolean) {
        if (!this._opened || !this._handle) {
            if (!CS.System.IO.File.Exists(this._datapath))
                throw new Error("FileNotFoundException: " + this._datapath);

            this._inMemory = !!memory;
            if (memory) {
                //this._handle = new CS.SQLite.SQLiteConnection("DATA SOURCE=:memory:;Version=3");
                this._handle = new CS.SQLite.SQLiteConnection(":memory:");
                //this._handle.Open();
                this._opened = true;

                this.copyToSelf(this._datapath);
            }
            else {
                //this._handle = new CS.SQLite.SQLiteConnection("DATA SOURCE=" + this._datapath);
                this._handle = new CS.SQLite.SQLiteConnection(this._datapath);
                //this._handle.Open();
                this._opened = true;
            }
        }
    }
    public close() {
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
    public dispose() {
        let set = this._mappingSet;
        if (set) {
            set.forEach(mapping => mapping.dispose());
        }
        this.close();
        this._mappings = null;
        this._mappingSet = null;
    }
    public markUpdateTable(tableName: string) {
        if (!this._updateTables)
            this._updateTables = [];
        if (this._updateTables.indexOf(tableName) >= 0 || !this._inMemory)
            return;
        this._updateTables.push(tableName);
    }
    public clearUpdateTables() {
        this._updateTables = undefined;
    }

    //#region  创建表丶删除表丶清空表
    public createTable(type: Type<object>) {
        let mapping = this.getMapping(type);
        let query = `CREATE TABLE IF NOT EXISTS "${mapping.tableName}"(\n)`;
        for (let i = 0; i < mapping.columns.length; i++) {
            if (i >= 0) query += ",\n";
            query += Orm.sqlDecl(mapping.columns[i]);
        }
        query += ")";

        this.markUpdateTable(mapping.tableName);
        return this.executeUpdate(query);
    }
    public dropTable(type: Type<object>) {
        let mapping = this.getMapping(type);
        let query = `DROP TABLE IF EXISTS "${mapping.tableName}"`;

        this.markUpdateTable(mapping.tableName);
        return this.executeUpdate(query);
    }
    public clearTable(type: Type<object>) {
        let mapping = this.getMapping(type);
        let query = `DELETE FROM "${mapping.tableName}"`;

        this.markUpdateTable(mapping.tableName);
        return this.executeUpdate(query);
    }
    //#endregion

    //#region 事务
    public runInTransaction(action: Function) {
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
    public beginTransaction() {
        if (this._transactionDepth == 0) {
            this._transactionDepth = 1;
            this.executeUpdate("BEGIN TRANSACTION");
        }
        throw new Error("InvalidOperationException: Cannot begin a transaction while already in a transaction.");
    }
    public commit() {
        if (this._transactionDepth > 0) {
            this._transactionDepth = 0;
            this.executeUpdate("COMMIT");
        }
    }
    public rollback(savepoint?: string) {
        if (savepoint)
            this.doPoint(savepoint, "ROLLBACK TO");
        else
            this.executeUpdate("ROLLBACK");
    }
    public release(savepoint: string) {
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
    public table<T extends object>(type: Type<T>) {
        return new DBQuery<T>(this, this.getMapping(type))
    }
    public get<T extends object>(type: Type<T>, pk: any) {
        let mapping = this.getMapping(type);
        let result = this.executeQuery<T>(type, mapping.getByPrimaryKeySql, pk);
        return result.length > 0 ? result[0] : null;
    }
    public lastInsertRowid(type: Type<object>) {
        var cmd = this.createCommand("");
        return cmd.lastInserRowid(this.getMapping(type));
    }
    //#endregion


    //#region 插入记录
    public insert(obj: any): number {
        let proto = Object.getPrototypeOf(obj);
        return this._insert(obj, "", this.getMapping(proto.constructor));
    }
    public insertOrReplace(obj: any): number {
        let proto = Object.getPrototypeOf(obj);
        return this._insert(obj, "OR REPLACE", this.getMapping(proto.constructor));
    }
    public insertAll(objs: Array<any>): number {
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

        this.markUpdateTable(mapping.tableName);

        let replacing = extra === "OR REPLACE";

        let cols = replacing ? mapping.insertOrReplaceColumns : mapping.insertColumns;
        let vals = new Array<any>();
        for (let col of cols) {
            vals.push(col.encode(obj[col.prop]));
        }

        let cmd = mapping.getInsertCommand(this, extra ?? "");
        let count = cmd.executeUpdate(vals);

        if (mapping.pk && mapping.pk.autoInc) {
            obj[mapping.pk.prop] = this.lastInsertRowid(mapping.Type);
        }

        return count;
    }
    //#endregion

    public executeUpdate(query: string, ...args: any[]): number {
        let command = this.createCommand(query, ...args);
        return command.executeUpdate();
    }
    public executeQuery<T extends object>(type: Type<T>, query: string, ...args: any[]): Array<T> {
        let command = this.createCommand(query, ...args);
        return command.executeQuery<T>(this.getMapping(type));
    }
    public newCommand(): DBCommand {
        if (!this._opened)
            throw new Error("Cannot create commands from unopened database");
        return new DBCommand(this);
    }
    public createCommand(query: string, ...args: any[]): DBCommand {
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
            if (/**!mapping.fixed &&  */ this.proofTable(mapping)) {
                this._mappings.set(type, mapping);
                this._mappingSet.add(mapping);
            }
        }
        return mapping;
    }
    /**校验当前数据表 */
    private proofTable(mapping: DBMapping) {
        //尝试创建表
        let createSql = "CREATE TABLE IF NOT EXISTS \"" + mapping.tableName + "\"(\n";
        for (let i = 0; i < mapping.columns.length; i++) {
            if (i > 0) createSql += ",\n";
            createSql += Orm.sqlDecl(mapping.columns[i]);
        }
        createSql += ")";
        this.executeUpdate(createSql);
        //从数据库拉取表信息<与当前表比对字段信息>
        let command = this.createCommand("SELECT sql FROM sqlite_master WHERE type = \"table\" AND name = ? ;", mapping.tableName);
        let existsSql = command.executeScalar<string>("string");
        //比对表的差异性 
        let createCols = this.proofColumns(createSql);
        let existsCols = this.proofColumns(existsSql);
        let addCols: Array<string> = new Array();
        let rebuild = createCols.length < existsCols.length;
        for (let i = 0; i < createCols.length && !rebuild; i++) {
            let col1 = createCols[i];
            if (i < existsCols.length) {
                let col2 = existsCols[i];
                if (col1.name !== col2.name || col1.content !== col2.content)
                    rebuild = true;
            } else
                addCols.push(col1.content);
        }
        //重构表
        if (rebuild) {
            //寻找相同字段<继承>
            let samecols: string = "";
            for (let i = 0; i < createCols.length; i++) {
                for (let j = 0; j < existsCols.length; j++) {
                    if (createCols[i].name === existsCols[j].name) {
                        if (samecols.length > 0) samecols += ",";
                        samecols += "\"" + createCols[i].name + "\"";
                        break;
                    }
                }
            }
            //console.log(JSON.stringify(createCols));
            //console.log(JSON.stringify(existsCols));
            //创建临时表->迁移相同字段数据->删除临时表
            this.runInTransaction(() => {
                let table_name = mapping.tableName;
                let table_temp = mapping.tableName + "_temp";
                this.executeUpdate(`PRAGMA foreign_keys = off;`);
                this.executeUpdate(`DROP TABLE IF EXISTS \"${table_temp}\" ;`);
                this.executeUpdate(`CREATE TABLE \"${table_temp}\" AS SELECT * FROM \"${table_name}\" ;`);
                this.executeUpdate(`DROP TABLE \"${table_name}\" ;`);
                this.executeUpdate(createSql);
                if (samecols.length > 0)
                    this.executeUpdate(`INSERT INTO \"${table_name}\" ( ${samecols} ) SELECT ${samecols} FROM \"${table_temp}\";`);
                this.executeUpdate(`DROP TABLE \"${table_temp}\" ;`)
                this.executeUpdate(`PRAGMA foreign_keys = on;`);

                console.warn(`column exception, rebuild sql: ${table_name}\n${createSql}`);
            });
            this.markUpdateTable(mapping.tableName);
        }
        //表追加字段
        else if (addCols && addCols.length > 0) {
            this.runInTransaction(() => {
                let table_name = mapping.tableName;
                for (var col of addCols) {
                    this.executeUpdate(`ALTER TABLE \"${table_name}\" ADD COLUMN ${col} ;`);
                    console.warn(`Alter table add column ${table_name}:${col}`);
                }
            });
            this.markUpdateTable(mapping.tableName);
        }

        return true;
    }
    /**从sql dll语句解析字段信息 */
    private proofColumns(sql: string) {
        if (!sql)
            throw new Error("Can't create a TableMapping instance, sql: " + sql);

        sql = sql.replace(/\n/g, "")
            .replace(/\r/g, "")
            .substring(sql.indexOf("(") + 1, sql.indexOf(")"));

        //console.log(sql);
        let fields: Array<{ name: string, content: string }> = new Array();
        for (let col of sql.split(",")) {
            col = col.trim();
            if (col.startsWith("\"")) {
                let index = col.indexOf("\" ");
                col = col.substring(1, index) + col.substring(index + 1);
            }
            let name = col.substring(0, col.indexOf(" "))
                .replace(/\t/g, "")
                .replace(/\r/g, "")
                .replace(/\n/g, "")
                .replace(/\"/g, "");
            fields.push({
                name,
                content: col
            });
        }
        return fields;
    }

    /**复制目标数据库到当前数据库
     * @param sourcePath 目标路径 
     */
    public copyToSelf(sourcePath: string, tableNames?: string[]) {
        if (!this._inMemory && sourcePath === this.datapath) {
            throw new Error("same source file");
        }
        let FROM_DB = "TEMP_DB_ATTACH", TO_DB = "main";
        try {
            //附加数据库
            this.executeUpdate(`ATTACH DATABASE "${sourcePath}" as "${FROM_DB}";`);
            //查询表列表, 然后复制到当前数据库
            let command = this.createCommand(`SELECT * FROM ${FROM_DB}.sqlite_master WHERE type = "table";`);
            let master = command.executeQueryFileds("name");
            if (master) {
                this.runInTransaction(() => {
                    let retentionTables = ["sqlite_master", "sqlite_sequence"];     //系统保留表, 不应修改此表内容

                    this.executeUpdate(`PRAGMA foreign_keys = off;`);
                    for (let { name } of master) {
                        if (retentionTables.indexOf(name) >= 0 || tableNames && tableNames.indexOf(name) < 0)
                            continue;
                        this.executeUpdate(`DROP TABLE IF EXISTS ${TO_DB}."${name}" ;`);
                        this.executeUpdate(`CREATE TABLE ${TO_DB}."${name}" AS SELECT * FROM ${FROM_DB}."${name}";`);
                    }
                    this.executeUpdate(`PRAGMA foreign_keys = on;`);
                });
            }
        } finally {
            //分离数据库
            this.executeUpdate(`DETACH DATABASE "${FROM_DB}";`);
        }
    }
    /**复制当前数据库到目标数据库 */
    public copyToTarget(sourcePath: string, tableNames?: string[]) {
        if (!this._inMemory && sourcePath === this.datapath) {
            throw new Error("same source file");
        }

        let FROM_DB = "main", TO_DB = "TEMP_DB_ATTACH";
        try {
            //附加数据库
            this.executeUpdate(`ATTACH DATABASE "${sourcePath}" as "${TO_DB}";`);

            //查询表列表, 然后复制到当前数据库
            let command = this.createCommand(`SELECT * FROM ${FROM_DB}.sqlite_master WHERE type = "table";`);
            let master = command.executeQueryFileds("name");
            if (master) {
                this.runInTransaction(() => {
                    let retentionTables = ["sqlite_master", "sqlite_sequence"];            //系统保留表, 不应修改此表内容

                    this.executeUpdate(`PRAGMA foreign_keys = off;`);
                    for (let { name } of master) {
                        if (retentionTables.indexOf(name) >= 0 || tableNames && tableNames.indexOf(name) < 0)
                            continue;
                        this.executeUpdate(`DROP TABLE IF EXISTS ${TO_DB}."${name}" ;`);
                        this.executeUpdate(`CREATE TABLE ${TO_DB}."${name}" AS SELECT * FROM ${FROM_DB}."${name}";`);
                    }
                    this.executeUpdate(`PRAGMA foreign_keys = on;`);
                });
            }
        } finally {
            //分离数据库
            this.executeUpdate(`DETACH DATABASE "${TO_DB}";`);
        }
    }

    public static createFile(path: string, delExists?: boolean): boolean {
        let exists = CS.System.IO.File.Exists(path);
        if (!exists || delExists) {
            if (exists)
                CS.System.IO.File.Delete(path);

            let handle = new CS.SQLite.SQLiteConnection(path, CS.SQLite.SQLiteOpenFlags.ReadWrite | CS.SQLite.SQLiteOpenFlags.Create);
            handle.Close();
            return true;
        }
        return false;
    }
}