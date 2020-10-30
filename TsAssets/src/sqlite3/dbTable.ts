import { DBCommand } from "./dbCommand";
import { DBConnection } from "./dbConnection";
import { DBMapping } from "./dbMapping";
import {
    Lambda,
    NodeType,
    Expression,
    BinaryExpression,
    ConstantExpression,
    FieldCallExpression,
    MethodCallExpression
} from "./utils/lambda";

type Where = { commandText: string, value?: any };
type Ordering = { columnName: string, ascending: boolean; };
type Betweening = { columnName: string, start: string, end: string; }

class DBTable<T> {
    private _map: DBMapping;
    private _conn: DBConnection;

    private _limit: number;
    private _offset: number;

    private _where: Lambda[];
    private _orderBys: Ordering[];
    private _betweenBy: Betweening;

    get table() { return this._map; }

    constructor(conn: DBConnection, map: DBMapping) {
        this._conn = conn;
        this._map = map;
    }
    clone<U>(): DBTable<U> {
        let ins = new DBTable<U>(this._conn, this._map);
        if (this._where) ins._where = new Array(...this._where);
        if (this._orderBys) ins._orderBys = new Array(...this._orderBys);
        ins._betweenBy = this._betweenBy;
        ins._limit = this._limit;
        ins._offset = this._offset;
        return ins;
    }
    //#region 条件方法
    where(expr: (val: T) => boolean, values?: {}) {
        let lambda = new Lambda(expr, values);

        let q = this.clone<T>();
        q.addWhere(lambda);
        return q;
    }
    orderBy<U>(expr: (val: T) => U) {
        return this.addOrder(expr, true);
    }
    orderByDescending<U>(expr: (val: T) => U) {
        return this.addOrder(expr, false);
    }
    between<U>(expr: (val: T) => U, start: string, end: string) {
        if (expr !== undefined && expr !== null && expr !== void 0) {
            let bin = new Lambda(expr).expression;
            if (!(bin instanceof FieldCallExpression))
                throw new Error("NotSupportedException: Order By does not support: " + expr);

            let q = this.clone<T>();
            q._betweenBy = {
                columnName: bin.fieldName,
                start,
                end
            };
            return q;
        }
        throw new Error("NotSupportedException: Must be a predicate")
    }
    take(n: number) {
        let q = this.clone<T>();
        q._limit = n;
        return q;
    }
    skip(n: number) {
        let q = this.clone<T>();
        q._offset = n;
        return q;
    }
    private addWhere(where: Lambda) {
        if (!this._where)
            this._where = new Array();
        this._where.push(where);
    }
    private addOrder<U>(expr: (val: T) => U, asc: boolean) {
        if (expr !== undefined && expr !== null && expr !== void 0) {
            let bin = new Lambda(expr).expression;
            if (!(bin instanceof FieldCallExpression))
                throw new Error("NotSupportedException: Order By does not support: " + expr);

            let q = this.clone<T>();
            if (!q._orderBys)
                q._orderBys = new Array();
            q._orderBys.push({
                columnName: bin.fieldName,
                ascending: asc
            });
            return q;
        }
        throw new Error("NotSupportedException: Must be a predicate")
    }
    //#endregion

    //#region 增删查改
    query() {
        this.generateQuery("*").executeQuery<T>(this._map);
    }
    update(obj: T) {
        if (!obj || !this._where)
            return 0;
        return this.generateUpdate(obj).executeUpdate();
    }
    updateOrInsert(obj: T) {
        if (!obj || !this._where)
            return 0;
        var ret = this.generateUpdate(obj).executeUpdate();
        if (ret > 0)
            return ret;

        return this._conn.insert(obj);
    }
    //#endregion

    //#region 构建DBCommand实例
    private generateQuery(cols: string): DBCommand {
        let args = new Array<any>();
        let query = "SELECT " + cols + " FROM \"" + this._map.tableName + "\" "

        if (this._where) {
            query += " WHERE " + this.compileExprs(this._where, args);
        }
        if (this._betweenBy) {
            query += " WHERE \"" + this._betweenBy.columnName + "\" BETWEEN ? AND ?";
            args.push(this._betweenBy.start);
            args.push(this._betweenBy.end);
        }
        if (this._orderBys) {
            query += " ORDER BY ";
            for (let i = 0; i < this._orderBys.length; i++) {
                if (i > 0) query += ",";
                query += "\"" + this._orderBys[i].columnName + "\"" + (this._orderBys[i].ascending ? "" : " DESC");
            }
        }
        if (this._limit) query += " LIMIT " + this._limit;
        if (this._offset) {
            if (!this._limit) query += " LIMIT -1";
            query += " OFFSET " + this._offset;
        }

        return this._conn.createCommand(query, ...args);
    }
    private generateUpdate(obj: T) {
        let args = new Array<any>();
        let query = "UPDATE \"" + this._map.tableName + "\" SET "

        let cols = this._map.columns;
        for (let i = 0; i < cols.length; i++) {
            if (cols[i] != this._map.pk) {
                if (args.length > 0) query += ",";
                query += "\"" + cols[i].name + "\" = ? "
                args.push(obj[cols[i].prop]);
            }
        }
        if (this._where) {
            query += " WHERE " + this.compileExprs(this._where, args);
        }

        return this._conn.createCommand(query, ...args);
    }
    private generateDelete(): DBCommand {
        let args = new Array<any>();
        let query = "DELETE FROM \"" + this._map.tableName + "\"";

        if (this._where) {
            query += " WHERE " + this.compileExprs(this._where, args);
        }

        return this._conn.createCommand(query, ...args);
    }
    //#endregion

    private compileExprs(wheres: Lambda[], out_args: any[]) {
        let text = "";
        for (let i = 0; i < wheres.length; i++) {
            if (i > 0)
                text += " AND ";
            let where = this.compileExpr(wheres[i].expression, out_args);
            text += where.commandText;
        }
        return text;
    }
    private compileExpr(expr: Expression, out_args: Array<any>): Where {
        //console.log(expr);
        if (expr.isMultiple || expr.isBinary) {
            let bin = <BinaryExpression>expr;

            let lefer = this.compileExpr(bin.left, out_args);
            let rightr = this.compileExpr(bin.right, out_args);

            //If either side is a parameter and is null, then handle the other side specially (for "is null"/"is not null")
            let text: string;
            if (lefer.commandText === "?" && lefer.value === undefined)
                text = this.compileNullBinaryExpression(bin, rightr);
            else if (rightr.commandText === "?" && rightr.value === undefined)
                text = this.compileNullBinaryExpression(bin, lefer);
            else
                text = "(" + lefer.commandText + " " + this.getSqlName(bin) + " " + rightr.commandText + ")";

            return { commandText: text };
        }
        else if (expr.isConstant) {
            let bin = <ConstantExpression>expr;
            out_args.push(bin.value);
            return {
                commandText: "?",
                value: bin.value
            }
        }
        else if (expr.isFieldCall) {
            let bin = <FieldCallExpression>expr;

            return {
                commandText: "\"" + bin.fieldName + "\"",
            }
        }
        else if (expr.isMethodCall) {
            let bin = <MethodCallExpression>expr;

            //获取参数表达式
            let args = new Array<Where>();
            for (var arg_expr of bin.methodParameters)
                args.push(this.compileExpr(arg_expr, out_args));

            let text: string;
            if (bin.methodName === "contains" && args.length == 1) {
                text = "(" + args[0].commandText + " IN " + bin.fieldName + ")";
            }
            else if (bin.methodName === "startsWith" && args.length == 1) {
                text = "(" + bin.fieldName + " LIKE (" + args[0].commandText + " || '%' )";
            }
            else if (bin.methodName === "endsWith" && args.length == 1) {
                text = "(" + bin.fieldName + " LIKE ( '%' || " + args[0].commandText + ")";
            }
            else if (bin.methodName === "link" && args.length == 1) {
                text = "(" + bin.fieldName + " LIKE " + args[1].commandText + ")";
            }
            else if (bin.methodName === "toUpperCase" && args.length == 1) {
                text = "(UPPER(" + bin.fieldName + "))";
            }
            else if (bin.methodName === "toLowerCase" && args.length == 1) {
                text = "(LOWER(" + bin.fieldName + "))";
            }
            else {
                let s: string = undefined;
                for (let arg of args) {
                    if (s) s += ",";
                    s += arg.commandText;
                }
                text = bin.methodName.toLowerCase() + "(" + s + ")";
            }
            return { commandText: text };
        }

        throw new Error("NotSupportedException: Cannot compile: " + expr);
    }
    private compileNullBinaryExpression(expr: BinaryExpression, param: Where) {
        switch (expr.nodeType) {
            case NodeType.Equal:
                return "(" + param.commandText + " IS ?)";
            case NodeType.NotEqual:
                return "(" + param.commandText + " IS NOT ?)";
            default:
                throw new Error("Cannot compile Null-BinaryExpression with type " + expr.nodeType);
        }
    }
    private getSqlName(expr: Expression) {
        switch (expr.nodeType) {
            case NodeType.GreaterThan:
                return ">";
            case NodeType.GreaterThanOrEqual:
                return ">=";
            case NodeType.LessThan:
                return "<";
            case NodeType.LessThanOrEqual:
                return "<=";
            case NodeType.And:
                return "&";
            case NodeType.AndAlso:
                return "AND";
            case NodeType.Or:
                return "|";
            case NodeType.OrElse:
                return "OR";
            case NodeType.Equal:
                return "=";
            case NodeType.NotEqual:
                return "!=";
            default:
                throw new Error("Cannot get SQL for: " + expr.nodeType);
        }
    }
}

export {
    DBTable
}