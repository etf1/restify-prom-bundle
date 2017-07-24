import * as Debug from 'debug';

const debug: Debug.IDebugger = Debug('restify-prom-bundle');

/**
 * Measured paths limitation handling.
 */
export class PathLimit {

  /**
   * Path list.
   */
  private pathsList: Set<string>;
  /**
   * Maximum number of measured paths.
   */
  private pathsLimit: number;

  /**
   * Sets paths limitation and duration clean routine.
   */
  constructor(maxPaths: number) {
    if ((typeof maxPaths !== 'number') || maxPaths < 0) {
      throw new TypeError('`maxPathsToCount` option for restify-prom-bundle.middleware() must be >=0 number');
    }
    this.pathsLimit = maxPaths;
    this.pathsList = new Set<string>();
  }

  /**
   * Tries to register an path.
   *
   * @return True if path was registered, false if not.
   */
  public registerPath(path: string): boolean {
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
