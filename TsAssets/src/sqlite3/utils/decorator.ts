/**元数据存储 */
class Metadata {
    decorator: Object;
    info: any;
    constructor(decorator: Object, info?: any) {
        this.decorator = decorator;
        this.info = info;
    }
}

/**简单装饰器信息存储 */
class Decorator {
    //类装饰器
    private static readonly actorClass: WeakMap<Object, Metadata[]> = new WeakMap();
    //字段/方法装饰器
    private static readonly actorProp: WeakMap<Object, Map<string, Metadata[]>> = new WeakMap();

    static get(target: Object, key: string): Metadata[] {
        //Class
        if (key === undefined || key === null || key === void 0) {
            let metadatas = Decorator.actorClass.get(target);
            if (!metadatas) {
                metadatas = new Array();
                Decorator.actorClass.set(target, metadatas);
            }
            return metadatas;
        }
        //Prop Or Method
        let maps = Decorator.actorProp.get(target);
        if (!maps) {
            maps = new Map();
            Decorator.actorProp.set(target, maps);
        }
        let metadatas = maps.get(key);
        if (!metadatas) {
            metadatas = new Array();
            maps.set(key, metadatas);
        }
        return metadatas;
    }
    static indexOf(target: Object, key: string, decorator: Object) {
        let metadatas = Decorator.get(target, key);
        for (let i = 0; i < metadatas.length; i++) {
            if (metadatas[i].decorator === decorator)
                return i;
        }
        return -1;
    }
    static add(target: Object, key: string, metadata: Metadata) {
        Decorator.get(target, key).push(metadata);
    }
    static first(target: Object, key: string, decorator: Object, inherit?: boolean): Metadata | undefined {
        let metadatas = Decorator.get(target, key);
        for (let i = 0; i < metadatas.length; i++) {
            if (metadatas[i].decorator === decorator)
                return metadatas[i];
        }
        if (inherit) {
            var proto = Object.getPrototypeOf(target);
            if (proto)
                return Decorator.first(proto, key, decorator, true);
        }
        return null;
    }
}

export {
    Metadata,
    Decorator,
}