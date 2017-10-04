"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Debug = require("debug");
const debug = Debug('restify-prom-bundle');
class PathLimit {
    constructor(maxPaths) {
        if ((typeof maxPaths !== 'number') || maxPaths < 0) {
            throw new TypeError('`maxPathsToCount` option for restify-prom-bundle.middleware() must be >=0 number');
        }
        this.pathsLimit = maxPaths;
        this.pathsList = new Set();
    }
    registerPath(path) {
        if (!this.pathsLimit || this.pathsList.has(path)) {
            return true;
        }
        if (this.pathsList.size < this.pathsLimit) {
            debug('Registering %s', path);
            this.pathsList.add(path);
            return true;
        }
        debug('Cannot register %s', path);
        return false;
    }
}
exports.PathLimit = PathLimit;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxOaWNhbmRlclxccmVzdGlmeS1wcm9tLWJ1bmRsZVxcc3JjXFxQYXRoTGltaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwrQkFBK0I7QUFFL0IsTUFBTSxLQUFLLEdBQW9CLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBSzVEO0lBY0UsWUFBWSxRQUFnQjtRQUMxQixFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sUUFBUSxLQUFLLFFBQVEsQ0FBQyxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sSUFBSSxTQUFTLENBQUMsa0ZBQWtGLENBQUMsQ0FBQztRQUMxRyxDQUFDO1FBQ0QsSUFBSSxDQUFDLFVBQVUsR0FBRyxRQUFRLENBQUM7UUFDM0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBQ3JDLENBQUM7SUFPTSxZQUFZLENBQUMsSUFBWTtRQUM5QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pELE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDZCxDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDMUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzlCLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pCLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDZCxDQUFDO1FBQ0QsS0FBSyxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDZixDQUFDO0NBQ0Y7QUF2Q0QsOEJBdUNDIiwiZmlsZSI6IlBhdGhMaW1pdC5qcyJ9
