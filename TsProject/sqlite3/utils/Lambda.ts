const binaryChars = [">=", "<=", "==", "===", "!=", "!==", ">", "<"];
const multipleChars = ["&&", "||"];

class Util {
    /** 是否由多个表达式联合组成的 */
    static isMultiple(str: string): boolean {
        if (str) {
            str = this.filterString(str);
            for (var v of multipleChars) {
                if (str.indexOf(v) >= 0)
                    return true;
            }
        }
        return false;
    }
    /** 是否二元表达式 */
    static isBinary(str: string): boolean {
        if (str) {
            str = this.filterString(str);
            for (var v of binaryChars) {
                if (str.indexOf(v) >= 0)
                    return true;
            }
        }
        return false;
    }
    /** 是否常量表达式 */
    static isConstant(str: string): boolean {
        if (str) {
            str = this.filterString(str);
            return str.indexOf(".") < 0;
        }
        return false;
    }
    /** 是否字段调用 */
    static isFieldCall(str: string, parameters: string[]): boolean {
        if (str) {
            str = this.filterString(str);
            if (str.indexOf(".") >= 0 && str.indexOf("(") < 0) {
                for (var param of parameters) {
                    if (str.indexOf(param + ".") >= 0)
                        return true;
                }
            }
        }
        return false;
    }
    /** 是否方法调用 */
    static isMethodCall(str: string, parameters: string[]): boolean {
        if (str) {
            str = this.filterString(str);
            if (str.indexOf(".") >= 0 && str.indexOf("(") > 0) {
                for (var param of parameters) {
                    if (str.indexOf(param + ".") >= 0)
                        return true;
                }
            }
        }
        return false;
    }
    /** 过滤字符串, 排除空格干扰, 排除字符串中字符干扰 */
    static filterString(str: string) {
        // TODO 未实现方法
        if (str === undefined || str === null || str === void 0)
            return "";
        if (typeof str !== "string")
            return str + "";
        return str;
    }
    /** 查找括号包含的表达式 */
    static findBrackets(str: string): { start: number, end: number } {
        let start: number = undefined, end: number = undefined;
        if (str) {
            let count: number = undefined;
            for (let i = 0; i < str.length; i++) {
                switch (str[i]) {
                    case "(":
                        start = start ?? i;
                        count = (count ?? 0) + 1;
                        break;
                    case ")":
                        count--;
                        break;
                }
                if (count !== undefined && count == 0) {
                    end = i;
                    break;
                }
            }
        }
        return { start: start ?? -1, end: end ?? -1 };
    }
    /** 移除无效括号 */
    static removeInvaildBrackets(str: string) {
        if (str) {
            let rep_expr = str.trim();
            while (true) {
                if (rep_expr[0] !== "(")
                    break;
                let count = 1, out = false
                for (let i = 1; i < rep_expr.length; i++) {
                    let char = rep_expr[i];
                    if (char === "(")
                        count++;
                    else if (char === ")")
                        count--;
                    if (count === 0 && i != rep_expr.length - 1) {
                        out = true;
                        break;
                    }
                }
                if (out)
                    break;
                rep_expr = rep_expr.substring(1, rep_expr.length - 1).trim();
            }
            return rep_expr;
        }
        return str;
    }
    /** 符号转为NodeType */
    static stringToNodeType(str: string): NodeType {
        switch (str) {
            case ">":
                return NodeType.GreaterThan;
            case ">=":
                return NodeType.GreaterThanOrEqual;
            case "<":
                return NodeType.LessThan;
            case "<=":
                return NodeType.LessThanOrEqual;
            case "==":
            case "===":
                return NodeType.Equal;
            case "!=":
            case "!==":
                return NodeType.NotEqual;
            case "&&":
                return NodeType.And;
            case "||":
                return NodeType.Or;
            case "And":
                return NodeType.AndAlso;
            case "Or":
                return NodeType.OrElse;
        }
        return NodeType.Unknown;
    }
    /** NodeType转为符号*/
    static nodeTypeToString(type: NodeType): string {
        switch (type) {
            case NodeType.GreaterThan:
                return ">";
            case NodeType.GreaterThanOrEqual:
                return ">=";
            case NodeType.LessThan:
                return "<";
            case NodeType.LessThanOrEqual:
                return "<=";
            case NodeType.Equal:
                return "==";
            case NodeType.NotEqual:
                return "!=";
            case NodeType.And:
                return "&&";
            case NodeType.Or:
                return "||";
            case NodeType.AndAlso:
                return "And";
            case NodeType.OrElse:
                return "Or";
        }
        for (var v in NodeType) {
            if (v === type.toString())
                return NodeType[v] + "(" + v + ")";
        }
        return type.toString();
    }
    /** 转为Expression对象 */
    static toExpression(expr: string, parameters: string[], values: {}): Expression {
        if (expr) {
            if (this.isMultiple(expr))
                return new MultipleExpression(expr, parameters, values);
            else if (this.isBinary(expr))

                return new BinaryExpression(expr, parameters, values);
            else if (this.isConstant(expr))
                return new ConstantExpression(expr, parameters, values);
            else if (this.isFieldCall(expr, parameters))
                return new FieldCallExpression(expr, parameters, values);
            else if (this.isMethodCall(expr, parameters))
                return new MethodCallExpression(expr, parameters, values);
            else {
                console.error("Not Supported Expression: " + expr);
                return new Expression(expr, parameters, values);
            }
        }
        return null;
    }
    /** 转换数值 */
    static changeValue(str: string, values: {}) {
        //从Values中读取数值
        if (values) {
            let v = values[str];
            if (v !== undefined)
                return v;
        }
        let first = str[0];
        if (first === "'" || first === '"' || first === "`")
            return str.substring(1, str.length - 1);
        if (str === "true" || str === "false")
            return str === "true";
        return str;
    }
}
enum NodeType {
    Unknown,

    /** 多元的(多个表达式联合) */
    Multiple,
    /** 二元的 */
    Binary,
    /** 常数 */
    Constant,
    /** 字段调用 */
    Field,
    /** 方法调用 */
    MethodCall,

    /** '>'运算 */
    GreaterThan,
    /** '>='运算 */
    GreaterThanOrEqual,
    /** '<'运算 */
    LessThan,
    /** '<='运算 */
    LessThanOrEqual,
    /** '=='运算 */
    Equal,
    /** '!='运算 */
    NotEqual,
    /** '&&'运算 */
    And,
    /** '||'运算 */
    Or,
    /** 'AND'运算 */
    AndAlso,
    /** 'OR'运算 */
    OrElse,
}
/** Lambda表达式解析
 */
class Lambda {
    private _func: Function;
    private _expr: string;
    private _parameters: Array<string>;
    private _values: {};
    get func() { return this._func; };
    get expr() { return this._expr; };
    get parameters() { return this._parameters; };
    get values() { return this._values; };

    constructor(func: Function, values?: {}) {
        let expr = func.toString();
        this._func = func;
        this._expr = expr;
        this._values = values;
        //解析
        let index = expr.indexOf("=>");
        if (index < 0)
            throw new Error("Not Supported Expression: " + expr);
        this._expr = expr.substring(index + 2).trim();
        this._parameters = new Array();
        expr.substring(0, index)
            .replace("(", "")
            .replace(")", "")
            .split(",")
            .forEach(p_name => {
                p_name = p_name.trim();
                if (p_name && p_name.length > 0)
                    this._parameters.push(p_name);
            });

        if (func.length != this._parameters.length)
            console.warn(`Function params length=${func.length},  but actually got ${this._parameters.length} \n${func.name}: ${func.toString()}`);
    }
    get expression(): Expression {
        return Util.toExpression(this._expr, this._parameters, this._values);
    }
}
/** 表达式基类 */
class Expression {
    /**表达式字符串 */
    protected _expr: string;
    /**参数名称 */
    protected _parameters: Array<string>;
    /**引用的变量 */
    protected _values: {};
    /**表达式类型 */
    protected _nodeType: NodeType;
    get nodeType() { return this._nodeType; }

    constructor(expr: string, parameters: Array<string>, values?: {}) {
        this._expr = expr;
        this._parameters = parameters;
        this._values = values;
        this._nodeType = NodeType.Unknown;
    }
    toString() {
        return this._expr + "\nTYPE:" + Util.nodeTypeToString(this._nodeType);
    }
    get isMultiple(): boolean {
        return this instanceof MultipleExpression;
    }
    get isBinary(): boolean {
        return this instanceof BinaryExpression;
    }
    get isConstant(): boolean {
        return this instanceof ConstantExpression;
    }
    get isFieldCall(): boolean {
        return this instanceof FieldCallExpression;
    }
    get isMethodCall(): boolean {
        return this instanceof MethodCallExpression;
    }
}
/** 多项表达式 */
class MultipleExpression extends Expression {
    private _left: string;
    private _right: string;
    get left(): Expression { return Util.toExpression(this._left, this._parameters, this._values); };
    get right(): Expression { return Util.toExpression(this._right, this._parameters, this._values);; };

    constructor(expr: string, parameters: Array<string>, values?: {}) {
        super(expr, parameters, values);
        this.working();
    }
    private working() {
        this._nodeType = NodeType.Multiple;

        let maps = {}, count = 0;
        let rep_expr = Util.removeInvaildBrackets(this._expr);
        //替换表达式括号包含的内容
        while (true) {
            let { start, end } = Util.findBrackets(rep_expr);
            if (start >= 0 && end >= 0) {
                let rep_name = "[rep_name" + (count++) + "]";
                let rep_content = rep_expr.substring(start, end + 1);
                maps[rep_name] = rep_content;
                rep_expr = rep_expr.replace(rep_content, rep_name);
            }
            else break;
        }
        //分割多元表达式
        for (let v of multipleChars) {
            let index = rep_expr.indexOf(v);
            if (index >= 0) {
                this._left = rep_expr.substring(0, index);
                this._right = rep_expr.substring(index + v.length);
                this._nodeType = Util.stringToNodeType(v);
                break;
            }
        }
        //还原表达式括号包含的内容
        Object.keys(maps).forEach(rep_name => {
            let rep_content = maps[rep_name];
            this._left = this._left.replace(rep_name, rep_content);
            this._right = this._right.replace(rep_name, rep_content);
        });
    }
    toString() {
        return this._expr + "\nTYPE:\t" + Util.nodeTypeToString(this._nodeType) + "\nLEFT:\t" + this._left + "\nRIGHT:\t" + this._right;
    }
}
/** 二元表达式 */
class BinaryExpression extends Expression {
    private _left: string;
    private _right: string;
    get left(): Expression { return Util.toExpression(this._left, this._parameters, this._values); };
    get right(): Expression { return Util.toExpression(this._right, this._parameters, this._values); };

    constructor(expr: string, parameters: Array<string>, values?: {}) {
        super(expr, parameters, values);
        this.working();
    }
    /**解析二元表达式 */
    private working() {
        this._nodeType = NodeType.Binary;

        let rep_expr = Util.removeInvaildBrackets(this._expr);
        for (let v of binaryChars) {
            let index = rep_expr.indexOf(v);
            if (index >= 0) {
                this._left = rep_expr.substring(0, index).trim();
                this._right = rep_expr.substring(index + v.length).trim();
                this._nodeType = Util.stringToNodeType(v);
                break;
            }
        }
    }
    toString() {
        return this._expr + "\nTYPE:\t" + Util.nodeTypeToString(this._nodeType) + "\nLEFT:\t" + this._left + "\nRIGHT:\t" + this._right;
    }
}
/** 常数表达式 */
class ConstantExpression extends Expression {
    private _value: any;
    get value() { return this._value; };

    constructor(expr: string, parameters: Array<string>, values?: {}) {
        super(expr, parameters, values);
        this.working();
    }
    /**解析表达式 */
    private working() {
        this._nodeType = NodeType.Constant;
        this._value = Util.changeValue(this._expr, this._values);
    }
    toString() {
        return this._expr + "\nTYPE:\t" + Util.nodeTypeToString(this._nodeType) + "\nVALUE:\t" + this._value;
    }
}
/** 字段访问表达式 */
class FieldCallExpression extends Expression {
    private _fieldName: string;
    get fieldName() { return this._fieldName; };

    constructor(expr: string, parameters: Array<string>, values?: {}) {
        super(expr, parameters, values);
        this.working();
    }
    /**解析表达式 */
    private working() {
        this._nodeType = NodeType.Field;
        for (var param of this._parameters) {
            let index = this._expr.indexOf(param + ".");
            if (index >= 0) {
                this._fieldName = this._expr.substring(index + param.length + 1).trim();
                break;
            }
        }
    }
    toString() {
        return this._expr + "\nTYPE:\t" + Util.nodeTypeToString(this._nodeType) + "\nFIELD_NAME:\t" + this._fieldName;
    }
}
/** 方法访问表达式 
 * methodName: 方法名称
 * fieldName: 不为undefined时, 则为调用字段方法
 */
class MethodCallExpression extends Expression {
    private _fieldName: string;
    private _methodName: string;
    private _methodParameters: Expression[];
    get fieldName() { return this._fieldName; };
    get methodName() { return this._methodName; };
    get methodParameters() { return this._methodParameters; };

    constructor(expr: string, parameters: Array<string>, values?: {}) {
        super(expr, parameters, values);
        this.working();
    }
    /**解析表达式 */
    private working() {
        this._nodeType = NodeType.MethodCall;
        this._methodParameters = new Array();
        for (var param of this._parameters) {
            let index = this._expr.indexOf(param + ".");
            if (index >= 0) {
                let method = this._expr.substring(index + param.length + 1).trim();
                index = method.indexOf(".");
                if (index >= 0) {
                    //调用字段方法
                    this._fieldName = method.substring(0, index);
                    this._methodName = method.substring(index + 1, method.indexOf("("));
                } else {
                    //调用对象方法
                    this._methodName = method.substring(0, method.indexOf("("));
                }
                //获取参数
                let parameters = method.substring(method.indexOf("(") + 1, method.indexOf(")"));
                for (var param of parameters.split(",")) {
                    let value = Util.changeValue(param, this._values);
                    let expr = Util.toExpression(value, this._parameters, this._values);
                    this._methodParameters.push(expr)
                }
                break;
            }
        }
    }
    toString() {
        return this._expr + "\nTYPE:\t" + Util.nodeTypeToString(this._nodeType)
            + "\nFIELD_NAME:\t" + this._fieldName
            + "\nMETHOD_NAME:\t" + this._methodName
            + "\nMETHOD_PARAMS:\t" + this._methodParameters;
    }
}

export {
    Lambda,
    NodeType,
    Expression,
    MultipleExpression,
    BinaryExpression,
    ConstantExpression,
    FieldCallExpression,
    MethodCallExpression
}