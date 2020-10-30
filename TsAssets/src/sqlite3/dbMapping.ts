import { DBColumn } from "./dbColumn";
import { Decorator } from "./utils/decorator";
import { DBConnection } from "./dbConnection";
import { DBCommandInsert } from "./dbCommandInsert";
import {
    Table,
    Column,
    Ignore,
    PrimaryKey,
    AutoInc,
    Unique,
    NotNull,
    DefaultValue,
    MaxLength
} from "./utils/attribute";

/**数据表映射信息 */
class DBMapping {
    /**表对应的js原型 proto */
    proto: any;
    /**数据表名称 */
    tableName: string;
    /**主键 */
    pk: DBColumn;
    /**字段信息 */
    columns: DBColumn[];
    /**通过主键查询 */
    getByPrimaryKeySql: string;
    //插入命令行
    private _insertCommand: DBCommandInsert;
    private _insertCommandExtra: string;

    private _insertColumns: DBColumn[];
    private _insertOrReplaceColumns: DBColumn[];
    get insertColumns(): DBColumn[] {
        if (!this._insertColumns) {
            this._insertColumns = new Array();
            this.columns.forEach(col => {
                if (!col.autoInc) this._insertColumns.push(col);
            });
        }
        return this._insertColumns;
    }
    get insertOrReplaceColumns(): DBColumn[] {
        if (!this._insertOrReplaceColumns) {
            this._insertOrReplaceColumns = new Array();
            this.columns.forEach(col => this._insertOrReplaceColumns.push(col));
        }
        return this._insertOrReplaceColumns;
    }

    constructor(proto: any) {
        let ctor = proto.constructor;
        let name: string = Decorator.first(proto, undefined, Table)?.info ?? ctor.name;

        this.proto = proto;
        this.tableName = name;

        //Columns
        this.columns = new Array();
        let ins = new (proto.constructor)();
        Object.keys(ins).forEach(key => {
            if (Decorator.first(proto, key, Ignore))
                return;

            let name: string = Decorator.first(proto, key, Column)?.info
            let pk: boolean = Decorator.first(proto, key, PrimaryKey, true) !== null;
            let autoInc: boolean = pk && Decorator.first(proto, key, AutoInc, true) !== null;
            let unique: boolean = Decorator.first(proto, key, Unique, true) !== null;
            let notNull: boolean = Decorator.first(proto, key, NotNull, true) !== null;
            let value: string = Decorator.first(proto, key, DefaultValue, true)?.info;
            let len: number = Decorator.first(proto, key, MaxLength, true)?.info;

            let col = new DBColumn({
                prop: key,
                propType: typeof (ins[key]),
                name: name,
                pk: pk,
                autoInc: autoInc,
                unique: unique,
                notNull: notNull,
                defaultValue: value,
                maxLength: len,
            });
            this.columns.push(col);
            if (col.pk) this.pk = col;
        });

        //PK
        if (this.pk)
            this.getByPrimaryKeySql = `SELECT * FROM "${this.tableName}" WHERE "${this.pk.name}" = ?`;
        else
            this.getByPrimaryKeySql = `SELECT * FROM "${this.tableName}" LIMIT 1`;
    }

    findColumn(name: string): DBColumn {
        for (let i = 0; i < this.columns.length; i++) {
            if (this.columns[i].name == name)
                return this.columns[i];
        }
        return null;
    }
    findColumnByPorpertyName(name: string): DBColumn {
        for (let i = 0; i < this.columns.length; i++) {
            if (this.columns[i].prop == name)
                return this.columns[i];
        }
        return null;
    }
    dispose() {
        if (this._insertCommand)
            this._insertCommand.dispose();
    }
    getInsertCommand(conn: DBConnection, extra: string) {
        if (!this._insertCommand) {
            this._insertCommand = this.createInsertCommand(conn, extra);
            this._insertCommandExtra = extra;
        }
        else if (!this._insertCommand.isConnect(conn) || this._insertCommandExtra != extra) {
            this._insertCommand.dispose();
            this._insertCommand = this.createInsertCommand(conn, extra);
            this._insertCommandExtra = extra;
        }
        return this._insertCommand;
    }
    createInsertCommand(conn: DBConnection, extra: string) {
        let insertSql = "";
        let cols = this.insertColumns;
        if (cols.length == 1 && cols[0].autoInc) {
            insertSql = `INSERT ${this.tableName} INTO "${extra}" DEFAULT VALUES`
        }
        else {
            if (extra === "OR REPLACE") cols = this.insertOrReplaceColumns;
            let names = new Array<string>(), vals = new Array<string>();
            for (let col of cols) {
                names.push("\"" + col.name + "\"");
                vals.push("?");
            }
            insertSql = `INSERT ${extra} INTO "${this.tableName}"(${names.join(",")}) VALUES (${vals.join(",")})`
        }
        let cmd = new DBCommandInsert(conn);
        cmd.commandText = insertSql;
        return cmd;
    }
    /**从proto原型中创建实例 */
    createInstance() {
        return <Object>(new (this.proto.constructor)());
    }
}

export { DBMapping };