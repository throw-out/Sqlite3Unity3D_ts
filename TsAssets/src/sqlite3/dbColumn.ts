type PropType = "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function";

/**字段信息 */
class DBColumn {
    /**字段名->key */
    prop: string;
    /**字段数据类型 */
    propType: PropType;
    /**数据库字段名称 */
    name: string;
    /**是否为主键 */
    pk: boolean;
    /**是否主键自增 */
    autoInc: boolean;
    /**是否唯一约束键 */
    unique: boolean;
    /**不允许为空 */
    notNull: boolean;
    /**默认值 */
    defaultValue: string;
    /**最大长度 */
    maxLength: number;

    constructor(info: Partial<DBColumn>) {
        this.prop = info.prop;
        this.propType = info.propType;
        this.name = info.name ?? info.prop;
        this.pk = info.pk || undefined;
        this.autoInc = info.autoInc || undefined;
        this.unique = info.unique || undefined;
        this.notNull = info.notNull || undefined;
        this.defaultValue = info.defaultValue;
        this.maxLength = info.maxLength;
    }
}

export {
    PropType,
    DBColumn
};