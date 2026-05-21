import path from "node:path";

export function resolveWorkspaceRoot(workspaceRoot?: string) {
    return path.resolve(workspaceRoot ?? process.cwd());
}

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