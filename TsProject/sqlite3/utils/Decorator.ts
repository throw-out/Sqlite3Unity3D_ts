/**元数据存储 */
class Metadata {
    private _info: any;
    private _decorator: Function;
    get info() { return this._info; };
    get decorator() { return this._decorator; };
    constructor(decorator: Function, info?: any) {
        this._info = info;
        this._decorator = decorator;
    }
}

/** 类修饰器 */
class ClassMetadata {
    /**装饰信息存储 */
    private static readonly actor: WeakMap<Object, Metadata[]> = new WeakMap();

    static add(target: Function, metadata: Metadata) {
        let metadatas = this.actor.get(target);
        if (!metadatas) {
            metadatas = new Array();
            this.actor.set(target, metadatas);
        }
        metadatas.push(metadata);
    }
    static get(target: Function, decorator?: Object, inherit?: boolean): Metadata[] {
        let metadatas = this.actor.get(target);
        if (metadatas && metadatas.length > 0) {
            //限定修饰标签
            if (decorator) {
                let _metadatas = new Array<Metadata>();
                metadatas.forEach(metadata => {
                    if (metadata.decorator === decorator)
                        _metadatas.push(metadata);
                });
                metadatas = _metadatas.length > 0 ? _metadatas : undefined;
            }
            return metadatas;
        }
        //基类信息
        if (inherit) {
            let _super: Function = Object.getPrototypeOf(target);
            if (typeof (_super) === "function" && _super !== Function && _super !== Object && _super.name.length > 0) {
                return this.get(_super, decorator, inherit);
            }
        }
        return undefined;
    }
    static getFirst(target: Function, decorator?: Object, inherit?: boolean) {
        let metadatas = this.get(target, decorator, inherit);
        if (metadatas && metadatas.length > 0)
            return metadatas[0];
        return undefined;
    }
}
/** 字段/方法修饰器 */
class FieldMetadata {
    /**装饰信息存储 */
    private static readonly actor: WeakMap<Function, Map<string, Metadata[]>> = new WeakMap();

    static add(target: Function, key: string, metadata: Metadata) {
        let fields = this.actor.get(target);
        if (!fields) {
            fields = new Map();
            this.actor.set(target, fields);
        }
        let metadatas = fields.get(key);
        if (!metadatas) {
            metadatas = new Array();
            fields.set(key, metadatas);
        }
        metadatas.push(metadata);
    }
    static get(target: Function, key: string, decorator?: Function, inherit?: boolean): Metadata[] {
        let fields = this.actor.get(target);
        if (fields) {
            let metadatas = fields.get(key);
            if (metadatas && metadatas.length > 0) {
                //限定修饰标签
                if (decorator) {
                    let _metadatas = new Array<Metadata>();
                    metadatas.forEach(metadata => {
                        if (metadata.decorator === decorator)
                            _metadatas.push(metadata);
                    });
                    metadatas = _metadatas.length > 0 ? _metadatas : undefined;
                }
                return metadatas;
            }
        }
        //基类信息
        if (inherit) {
            let _super: Function = Object.getPrototypeOf(target);
            if (typeof (_super) === "function" && _super !== Function && _super !== Object && _super.name.length > 0) {
                return this.get(_super, key, decorator, inherit);
            }
        }
        return undefined;
    }
    static getFirst(target: Function, key: string, decorator?: Function, inherit?: boolean) {
        let metadatas = this.get(target, key, decorator, inherit);
        if (metadatas && metadatas.length > 0)
            return metadatas[0];
        return undefined;
    }
    static getFields(target: Function, inherit?: boolean): string[] {
        let keys = new Array<string>();
        let fields = this.actor.get(target);
        if (fields) {
            keys.push(...fields.keys())
        }
        //基类信息
        if (inherit) {
            let _super: Function = Object.getPrototypeOf(target);
            if (typeof (_super) === "function" && _super !== Function && _super !== Object && _super.name.length > 0) {
                //读取基类字段
                for (let _k1 of this.getFields(_super, inherit).reverse()) {
                    let add = true;
                    for (let _k2 of keys) {
                        if (_k1 === _k2) {
                            add = false; break;
                        }
                    }
                    if (add) keys.unshift(_k1);
                }
            }
        }
        return keys;
    }
}

export {
    Metadata,
    ClassMetadata,
    FieldMetadata
}