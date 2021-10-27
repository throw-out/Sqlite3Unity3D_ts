import { DBColumn } from "./DBColumn";


export class Orm {
    public static sqlDecl(col: DBColumn): string {
        let decl = "\"" + col.name + "\" " + Orm.sqlType(col) + " ";

        if (col.pk) decl += "PRIMARY KEY ";
        if (col.autoInc) decl += "AUTOINCREMENT ";
        if (col.unique) decl += "UNIQUE ";
        if (col.notNull) decl += "NOT NULL ";
        let v_type = typeof (col.defaultValue);
        if (v_type !== "undefined" && v_type !== "object" && v_type !== "function")
            decl += "DEFAULT \"" + col.defaultValue + "\" ";
        return decl.trim();
    }
    public static sqlType(col: DBColumn): string {
        switch (col.propType) {
            case "string":
            case "number[]":
            case "string[]":
                if (col.maxLength !== undefined)
                    return "VARCHAR(" + col.maxLength + ")";
                return "VARCHAR";
            case "number":
                if (col.pk)
                    return "INTEGER";
                return "REAL";
            case "integer":
                return "INTEGER";
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