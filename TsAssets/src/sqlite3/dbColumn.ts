type DBType = "string" | "number" | "bigint" | "boolean" | "symbol" | "object";

/**字段信息 */
type DBColumn = {
    /**字段名->key */
    prop: string;
    /**字段数据类型 */
    propType: DBType;
    /**数据库字段名称 */
    name?: string;
    /**是否为主键 */
    pk?: boolean;
    /**是否主键自增 */
    autoInc?: boolean;
    /**是否唯一约束键 */
    unique?: boolean;
    /**不允许为空 */
    notNull?: boolean;
    /**默认值 */
    defaultValue?: any;
    /**最大长度 */
    maxLength?: number;
}

/**表信息 */
class DBTable {
    tableName?: string;
    columns: DBColumn[]
    constructor(data?: Partial<DBTable>) {
        if (data) {
            this.tableName = data.tableName;
            this.columns = data.columns;
        }
        if (!this.columns) this.columns = [];
    }
}

export {
    DBType,
    DBColumn,
    DBTable
};