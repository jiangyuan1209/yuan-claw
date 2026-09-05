import path from "node:path";

export function resolveWorkspaceRoot(workspaceRoot?: string) {
    return path.resolve(workspaceRoot ?? process.cwd());
}

/**
 * 将目标路径解析为安全的绝对路径，同时防止路径逃逸。
 *
 * 规则：
 *   - 绝对路径：直接放行，可访问磁盘任意位置（用于支持用户显式指定的完整路径）。
 *   - 相对路径：以 workspaceRoot 为基准解析，并校验解析后的路径是否仍在 workspace 内。
 *     如果相对路径通过 "../" 等方式逃逸出 workspace 边界，则抛出错误。
 *
 * @param workspaceRoot - 工作区根目录（Agent 启动时确定的操作边界）
 * @param targetPath - 工具调用中传入的目标路径（相对路径或绝对路径）
 * @returns 解析后的安全绝对路径
 * @throws 当相对路径逃逸出 workspace 时抛出错误
 */
export function resolveSafePath(workspaceRoot: string, targetPath: string) {
    // If the target is an absolute path, allow reading it directly (anywhere on disk)
    if (path.isAbsolute(targetPath)) {
        return path.resolve(targetPath);
    }

    // Relative paths are resolved against the workspace root
    const root = path.resolve(workspaceRoot);
    const fullPath = path.resolve(root, targetPath);

    const relative = path.relative(root, fullPath);

    if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
    ) {
        throw new Error(`Path escapes workspace: ${targetPath}`);
    }

    return fullPath;
}

export function toWorkspaceRelativePath(workspaceRoot: string, fullPath: string) {
    return path.relative(path.resolve(workspaceRoot), path.resolve(fullPath));
}