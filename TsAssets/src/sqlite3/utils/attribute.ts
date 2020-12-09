import { ClassMetadata, FieldMetadata, Metadata } from "./decorator";

type DBType = "string" | "number" | "bigint" | "boolean" | "symbol" | "object";

/**
 * 定义表名称
 * @param alias 表别名
 */
function Table(alias: string): ClassDecorator {
    return (target) => {
        ClassMetadata.add(target, new Metadata(Table, alias));
    };
}

/**
 * 定义字段信息
 * @param type 字段数据类型
 * @param alias 字段别名
 */
function Column(type: DBType, alias?: string): PropertyDecorator {
    return (target, key: string) => {
        FieldMetadata.add(target.constructor, key, new Metadata(Column, { type, alias }));
    };
}

/**主键 */
function PrimaryKey(): PropertyDecorator {
    return (target, key: string) => {
        FieldMetadata.add(target.constructor, key, new Metadata(PrimaryKey));
    };
}

/**主键自增 */
function AutoInc(): PropertyDecorator {
    return (target, key: string) => {
        FieldMetadata.add(target.constructor, key, new Metadata(AutoInc));
    };
}

/**唯一约束键 */
function Unique(): PropertyDecorator {
    return (target, key: string) => {
        FieldMetadata.add(target.constructor, key, new Metadata(Unique));
    };
}

/**不允许空值 */
function NotNull(): PropertyDecorator {
    return (target, key: string) => {
        FieldMetadata.add(target.constructor, key, new Metadata(NotNull));
    };
}

/**默认值 */
function DefaultValue(value: string): PropertyDecorator {
    return (target, key: string) => {
        FieldMetadata.add(target.constructor, key, new Metadata(DefaultValue, value));
    };
}

/**最大长度 */
function MaxLength(value: number): PropertyDecorator {
    return (target, key: string) => {
        FieldMetadata.add(target.constructor, key, new Metadata(MaxLength, value));
    };
}

export {
    Table,
    Column,
    PrimaryKey,
    AutoInc,
    Unique,
    NotNull,
    DefaultValue,
    MaxLength,
}