import { Metadata, Decorator, } from "./decorator";

/**定义表名称 */
function Table(alias: string): ClassDecorator {
    return (target) => {
        Decorator.add(target, undefined, new Metadata(Table, alias));
    };
}

/**定义字段别名 */
function Column(alias: string): PropertyDecorator {
    return (target, key: string) => {
        Decorator.add(target, key, new Metadata(Column, alias));
    };
}

/**忽略此字段 */
function Ignore(): PropertyDecorator {
    return (target, key: string) => {
        Decorator.add(target, key, new Metadata(Ignore));
    };
}

/**定义主键 */
function PrimaryKey(): PropertyDecorator {
    return (target, key: string) => {
        Decorator.add(target, key, new Metadata(PrimaryKey));
    };
}

/**定义主键自增 */
function AutoInc(): PropertyDecorator {
    return (target, key: string) => {
        Decorator.add(target, key, new Metadata(AutoInc));
    };
}

/**定义唯一约束键 */
function Unique(): PropertyDecorator {
    return (target, key: string) => {
        Decorator.add(target, key, new Metadata(Unique));
    };
}

/**不允许空值 */
function NotNull(): PropertyDecorator {
    return (target, key: string) => {
        Decorator.add(target, key, new Metadata(NotNull));
    };
}

/**默认值 */
function DefaultValue(value: string): PropertyDecorator {
    return (target, key: string) => {
        Decorator.add(target, key, new Metadata(DefaultValue, value));
    };
}

/**最大长度 */
function MaxLength(value: number): PropertyDecorator {
    return (target, key: string) => {
        Decorator.add(target, key, new Metadata(MaxLength, value));
    };
}

export {
    Table,
    Column,
    Ignore,
    PrimaryKey,
    AutoInc,
    Unique,
    NotNull,
    DefaultValue,
    MaxLength,
}