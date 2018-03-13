export declare class PathLimit {
    private pathsList;
    private pathsLimit;
    constructor(maxPaths: number);
    registerPath(path: string): boolean;
}
