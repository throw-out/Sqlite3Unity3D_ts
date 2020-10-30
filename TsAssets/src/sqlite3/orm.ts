import { DBColumn } from "./dbColumn";


class Orm {
    static sqlDecl(col: DBColumn): string {
        let decl = "\"" + col.name + "\" " + Orm.sqlType(col) + " ";

        if (col.pk) decl += "PRIMARY KEY ";
        if (col.autoInc) decl += "AUTOINCREMENT ";
        if (col.unique) decl += "UNIQUE ";
        if (col.notNull) decl += "NOT NULL ";
        if (col.defaultValue && col.defaultValue.length > 0)
            decl += "DEFAULT \"" + col.defaultValue + "\" ";
        return decl.trim();
    }
    static sqlType(col: DBColumn): string {
        switch (col.propType) {
            case "string":
                if (col.maxLength)
                    return "VARCHAR(" + col.maxLength + ")";
                return "VARCHAR";
            case "number":
                return "REAL";
            case "bigint":
                return "BIGINT";
            case "boolean":
                return "INTEGER";
            //扩展对Object类型的支持
            case "object":
                return "VARCHAR";
            default:
                throw new Error("NotSupportedException: " + col.propType);
        }
    }
}

export {
    Orm
}