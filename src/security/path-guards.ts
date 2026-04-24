import path from "node:path";

export function resolveWorkspaceRoot(workspaceRoot?: string) {
    return path.resolve(workspaceRoot ?? process.cwd());
}

export function resolveSafePath(workspaceRoot: string, targetPath: string) {
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