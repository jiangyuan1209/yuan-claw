import React, { useState, useCallback, useEffect } from "react";
import {
    Modal,
    Input,
    Button,
    Checkbox,
    Radio,
    Typography,
    Empty,
    Spin,
    Space,
    Alert,
    theme,
} from "antd";
import {
    FolderOutlined,
    FolderOpenOutlined,
    ArrowUpOutlined,
    ReloadOutlined,
    CloseOutlined,
    HomeOutlined,
} from "@ant-design/icons";
import type { DirEntry, Workspace } from "../types";

const { Text } = Typography;

interface WorkspaceModalProps {
    open: boolean;
    onClose: () => void;
    /** 提交创建，返回创建好的工作区（失败返回 null） */
    onCreate: (input: {
        name: string;
        directories: string[];
        primaryDir: string;
    }) => Promise<Workspace | null>;
}

/**
 * WorkspaceModal — 创建工作区。
 *
 * 目录选择走服务端的 /api/fs/dirs 逐级浏览：浏览器出于安全限制拿不到本地
 * 目录的绝对路径（<input webkitdirectory> 只给相对路径），而工作区必须以
 * 绝对路径记录主目录，才能作为 Agent 相对路径读写的解析基准。
 *
 * 交互：勾选一个或多个目录 → 在已选列表中指定其中一个为主目录 → 创建。
 */
export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
    open,
    onClose,
    onCreate,
}) => {
    const { token } = theme.useToken();
    const [currentPath, setCurrentPath] = useState("");
    const [parentPath, setParentPath] = useState<string | null>(null);
    const [entries, setEntries] = useState<DirEntry[]>([]);
    const [browsing, setBrowsing] = useState(false);
    const [browseError, setBrowseError] = useState("");

    const [name, setName] = useState("");
    const [selected, setSelected] = useState<string[]>([]);
    const [primaryDir, setPrimaryDir] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const loadDir = useCallback(async (target?: string) => {
        setBrowsing(true);
        setBrowseError("");
        try {
            const query = target ? `?path=${encodeURIComponent(target)}` : "";
            const res = await fetch(`/api/fs/dirs${query}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "读取目录失败");
            }
            setCurrentPath(data.path as string);
            setParentPath(data.parent as string | null);
            setEntries(data.entries as DirEntry[]);
        } catch (err) {
            setBrowseError(err instanceof Error ? err.message : "读取目录失败");
        } finally {
            setBrowsing(false);
        }
    }, []);

    // 每次打开都从默认位置（用户主目录）重新开始浏览
    useEffect(() => {
        if (open) {
            loadDir();
        }
    }, [open, loadDir]);

    /** 应用新的已选目录列表，并保证主目录始终是已选目录之一 */
    const applySelection = useCallback((next: string[]) => {
        setSelected(next);
        setPrimaryDir((currentPrimary) =>
            next.includes(currentPrimary) ? currentPrimary : (next[0] ?? ""),
        );
    }, []);

    const toggleSelected = useCallback(
        (dirPath: string) => {
            applySelection(
                selected.includes(dirPath)
                    ? selected.filter((p) => p !== dirPath)
                    : [...selected, dirPath],
            );
        },
        [applySelection, selected],
    );

    const removeSelected = useCallback(
        (dirPath: string) => {
            applySelection(selected.filter((p) => p !== dirPath));
        },
        [applySelection, selected],
    );

    const handleClose = useCallback(() => {
        if (submitting) return;
        setName("");
        setSelected([]);
        setPrimaryDir("");
        onClose();
    }, [onClose, submitting]);

    const handleCreate = useCallback(async () => {
        if (selected.length === 0 || !primaryDir) return;

        setSubmitting(true);
        try {
            const workspace = await onCreate({ name, directories: selected, primaryDir });
            if (workspace) {
                setName("");
                setSelected([]);
                setPrimaryDir("");
                onClose();
            }
        } finally {
            setSubmitting(false);
        }
    }, [name, onClose, onCreate, primaryDir, selected]);

    return (
        <Modal
            title="创建工作区"
            open={open}
            onCancel={handleClose}
            onOk={handleCreate}
            okText="创建工作区"
            cancelText="取消"
            confirmLoading={submitting}
            okButtonProps={{ disabled: selected.length === 0 || !primaryDir }}
            width={680}
        >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        工作区名称（留空则使用主目录名）
                    </Text>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="例如：博客后端"
                        maxLength={60}
                        style={{ marginTop: 4 }}
                    />
                </div>

                <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        选择目录（可多选，其中一个需指定为主目录）
                    </Text>

                    {/* 浏览工具条 */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 6,
                            padding: "6px 8px",
                            border: `1px solid ${token.colorBorderSecondary}`,
                            borderRadius: 6,
                        }}
                    >
                        <Button
                            size="small"
                            icon={<ArrowUpOutlined />}
                            disabled={!parentPath || browsing}
                            onClick={() => parentPath && loadDir(parentPath)}
                        >
                            上级
                        </Button>
                        <Button
                            size="small"
                            icon={<ReloadOutlined />}
                            disabled={browsing}
                            onClick={() => loadDir(currentPath)}
                        />
                        <Text
                            ellipsis={{ tooltip: currentPath }}
                            style={{ flex: 1, fontSize: 12, fontFamily: "monospace" }}
                        >
                            {currentPath || "..."}
                        </Text>
                        <Button
                            size="small"
                            type={selected.includes(currentPath) ? "primary" : "default"}
                            icon={<FolderOpenOutlined />}
                            disabled={!currentPath}
                            onClick={() => toggleSelected(currentPath)}
                        >
                            {selected.includes(currentPath) ? "已选当前目录" : "选择当前目录"}
                        </Button>
                    </div>

                    {browseError && (
                        <Alert
                            type="error"
                            showIcon
                            message={browseError}
                            style={{ marginTop: 8 }}
                        />
                    )}

                    {/* 目录列表 */}
                    <div
                        style={{
                            marginTop: 8,
                            maxHeight: 240,
                            overflowY: "auto",
                            border: `1px solid ${token.colorBorderSecondary}`,
                            borderRadius: 6,
                        }}
                    >
                        {browsing ? (
                            <div style={{ textAlign: "center", padding: 24 }}>
                                <Spin size="small" />
                            </div>
                        ) : entries.length === 0 ? (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description="没有子目录"
                                style={{ margin: "16px 0" }}
                            />
                        ) : (
                            entries.map((entry) => {
                                const checked = selected.includes(entry.path);
                                return (
                                    <div
                                        key={entry.path}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            padding: "6px 10px",
                                            borderBottom: `1px solid ${token.colorBorderSecondary}`,
                                            background: checked ? token.colorPrimaryBg : "transparent",
                                        }}
                                    >
                                        <Checkbox
                                            checked={checked}
                                            onChange={() => toggleSelected(entry.path)}
                                        />
                                        <FolderOutlined
                                            style={{ color: token.colorTextSecondary }}
                                        />
                                        <Text
                                            style={{ flex: 1, fontSize: 13, cursor: "pointer" }}
                                            onClick={() => loadDir(entry.path)}
                                        >
                                            {entry.name}
                                        </Text>
                                        <Button
                                            type="link"
                                            size="small"
                                            icon={<HomeOutlined />}
                                            onClick={() => loadDir(entry.path)}
                                        >
                                            进入
                                        </Button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* 已选目录 + 主目录指定 */}
                <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        已选目录 ({selected.length}) — 指定主目录（Agent 默认在此读写）
                    </Text>
                    {selected.length === 0 ? (
                        <Text
                            type="secondary"
                            style={{ fontSize: 12, display: "block", marginTop: 6 }}
                        >
                            尚未选择目录
                        </Text>
                    ) : (
                        <Radio.Group
                            value={primaryDir}
                            onChange={(e) => setPrimaryDir(e.target.value as string)}
                            style={{ display: "block", marginTop: 6 }}
                        >
                            <Space direction="vertical" size={4} style={{ width: "100%" }}>
                                {selected.map((dir) => (
                                    <div
                                        key={dir}
                                        style={{ display: "flex", alignItems: "center", gap: 8 }}
                                    >
                                        <Radio value={dir} style={{ flex: 1, minWidth: 0 }}>
                                            <Text
                                                ellipsis={{ tooltip: dir }}
                                                style={{
                                                    fontSize: 12,
                                                    fontFamily: "monospace",
                                                    maxWidth: 460,
                                                }}
                                            >
                                                {dir}
                                            </Text>
                                        </Radio>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<CloseOutlined />}
                                            onClick={() => removeSelected(dir)}
                                        />
                                    </div>
                                ))}
                            </Space>
                        </Radio.Group>
                    )}
                </div>
            </Space>
        </Modal>
    );
};
