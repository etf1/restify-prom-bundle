export interface IPreMiddlewareConfig {
    route?: string | false;
    defaults?: string[];
    exclude?: string | string[] | RegExp | Function;
    promDefaultDelay?: number;
    maxPathsToCount?: number;
}
export declare const preMiddleware: Function;
