import { DBType } from "./DBType";

/**字段信息 */
class DBColumn {
    /**字段名->key */
    public prop: string;
    /**字段数据类型 */
    public propType: DBType;
    /**数据库字段名称 */
    public name?: string;
    /**是否为主键 */
    public pk?: boolean;
    /**是否主键自增 */
    public autoInc?: boolean;
    /**是否唯一约束键 */
    public unique?: boolean;
    /**不允许为空 */
    public notNull?: boolean;
    /**默认值 */
    public defaultValue?: any;
    /**最大长度 */
    public maxLength?: number;
    constructor(p?: Partial<DBColumn>) {
        if (p) {
            this.prop = p.prop;
            this.propType = p.propType;
            this.name = p.name;
            this.pk = p.pk;
            this.autoInc = p.autoInc;
            this.unique = p.unique;
            this.notNull = p.notNull;
            this.defaultValue = p.defaultValue;
            this.maxLength = p.maxLength;
        }
    }
    public encode(obj: any) {
        if (this.propType === "object" && obj !== undefined) {

        }
        return obj;
    }
    public decode(obj: any) {
        if (this.propType === "object" && obj !== undefined) {

        }
        return obj;
    }
}

/**表信息 */
class DBTable {
    public tableName?: string;
    public columns: DBColumn[]
    constructor(data?: Partial<DBTable>) {
        if (data) {
            this.tableName = data.tableName;
            this.columns = data.columns;
        }
        if (!this.columns) this.columns = [];
    }
}

export {
    DBColumn,
    DBTable
};