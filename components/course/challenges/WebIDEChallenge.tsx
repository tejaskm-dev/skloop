"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import MonacoEditor, { loader } from "@monaco-editor/react";
import {
    Play, RotateCcw, CheckCircle, Layout, Code, Eye, Smartphone, Tablet, Laptop,
    RefreshCw, FileText, ChevronLeft, ChevronRight, Save, Trash2, Info,
    FolderPlus, FilePlus, Folder, FolderOpen, Wand2, Trash, Edit2, MoreVertical, Maximize2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

// Register Emmet for Monaco
import { emmetHTML, emmetCSS } from "emmet-monaco-es";

// Configure Monaco
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs' } });

const skloopTheme = {
    base: 'vs' as const,
    inherit: true,
    rules: [
        { token: 'comment', foreground: 'A1A1AA', fontStyle: 'italic' },
        { token: 'keyword', foreground: '000000', fontStyle: 'bold' },
        { token: 'string', foreground: '16A34A' },
        { token: 'number', foreground: 'D97706' },
        { token: 'delimiter', foreground: '71717A' },
        { token: 'tag', foreground: '000000', fontStyle: 'bold' },
        { token: 'attribute.name', foreground: '4F46E5' },
        { token: 'attribute.value', foreground: '16A34A' },
    ],
    colors: {
        'editor.background': '#FDFCF8',
        'editor.foreground': '#1A1A1A',
        'editorCursor.foreground': '#1A1A1A',
        'editor.lineHighlightBackground': '#F3F4F6',
        'editorLineNumber.foreground': '#D1D5DB',
        'editorLineNumber.activeForeground': '#1A1A1A',
        'editor.selectionBackground': '#D4F268',
        'editorBracketMatch.background': '#D4F268',
        'editorBracketMatch.border': '#D4F268',
    }
};

interface FileNode {
    id: string;
    name: string;
    type: "file" | "folder";
    content?: string;
    language?: string;
    parentId: string | null;
    isExpanded?: boolean;
}

interface WebIDEChallengeProps {
    challengeData: {
        initialHtml: string;
        initialCss: string;
        initialJs: string;
        instructions: string;
        validationRules: { type: string; selector?: string; property?: string; value?: string; text?: string }[];
    };
    onComplete: () => void;
}

export default function WebIDEChallenge({ challengeData, onComplete }: WebIDEChallengeProps) {
    const getInitialProject = (): FileNode[] => [
        { id: 'index.html', name: 'index.html', type: 'file', content: challengeData.initialHtml, language: 'html', parentId: null },
        { id: 'style.css', name: 'style.css', type: 'file', content: challengeData.initialCss, language: 'css', parentId: null },
        { id: 'script.js', name: 'script.js', type: 'file', content: challengeData.initialJs, language: 'javascript', parentId: null },
    ];

    const [files, setFiles] = useState<FileNode[]>(getInitialProject());
    const [activeTab, setActiveTab] = useState<string>("index.html");
    const [srcDoc, setSrcDoc] = useState("");
    const [isValidating, setIsValidating] = useState(false);
    const [isPassed, setIsPassed] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
    const [logs, setLogs] = useState<{ type: string; message: string }[]>([]);
    const [showLogs, setShowLogs] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<"mobile" | "tablet" | "desktop">("desktop");
    const [previewKey, setPreviewKey] = useState(0);
    const [showSidebar, setShowSidebar] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // File Management UI State
    const [isCreating, setIsCreating] = useState<{ type: 'file' | 'folder', parentId: string | null } | null>(null);
    const [newItemName, setNewItemName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    // Explorer context: which folder is "selected" (new items go inside it)
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    // Drag and drop
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | 'root' | null>(null);
    // Fullscreen + resize
    const [fullscreenPane, setFullscreenPane] = useState<"editor" | "preview" | null>(null);
    const [dividerPosition, setDividerPosition] = useState(50);
    const [isResizing, setIsResizing] = useState(false);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const editorRef = useRef<any>(null);

    // Resize handlers
    const startResizing = useCallback(() => setIsResizing(true), []);
    const stopResizing = useCallback(() => setIsResizing(false), []);
    const resize = useCallback((e: any) => {
        if (!isResizing) return;
        const newPosition = (e.clientX / window.innerWidth) * 100;
        if (newPosition > 20 && newPosition < 80) setDividerPosition(newPosition);
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    // File Management Actions
    const addFile = (type: 'file' | 'folder', parentId: string | null = null, name?: string) => {
        const id = Math.random().toString(36).substr(2, 9);
        const fileName = name || (type === 'file' ? 'new_file.html' : 'new_folder');
        const extension = fileName.split('.').pop();
        const language = extension === 'js' ? 'javascript' : extension === 'css' ? 'css' : 'html';

        const newNode: FileNode = {
            id,
            name: fileName,
            type,
            parentId,
            content: type === 'file' ? '' : undefined,
            language: type === 'file' ? language : undefined,
            isExpanded: true
        };

        setFiles(prev => [...prev, newNode]);
        if (type === 'file') setActiveTab(id);
        setIsCreating(null);
        setNewItemName("");
    };

    const deleteFile = (id: string) => {
        if (!confirm("Are you sure you want to delete this?")) return;
        setFiles(prev => {
            const idsToDelete = new Set([id]);
            const findChildren = (pid: string) => {
                prev.filter(f => f.parentId === pid).forEach(c => {
                    idsToDelete.add(c.id);
                    findChildren(c.id);
                });
            };
            findChildren(id);
            return prev.filter(f => !idsToDelete.has(f.id));
        });
        if (activeTab === id) setActiveTab("index.html");
    };

    const renameFile = (id: string, newName: string) => {
        setFiles(prev => prev.map(f => {
            if (f.id === id) {
                const extension = newName.split('.').pop();
                const language = extension === 'js' ? 'javascript' : extension === 'css' ? 'css' : 'html';
                return { ...f, name: newName, language: f.type === 'file' ? language : f.language };
            }
            return f;
        }));
        setEditingId(null);
        setNewItemName("");
    };

    const toggleFolder = (id: string) => {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, isExpanded: !f.isExpanded } : f));
    };

    const moveFile = (sourceId: string, targetFolderId: string | null) => {
        if (targetFolderId) {
            let cur: string | null = targetFolderId;
            while (cur) {
                if (cur === sourceId) return;
                cur = files.find(f => f.id === cur)?.parentId ?? null;
            }
        }
        setFiles(prev => prev.map(f =>
            f.id === sourceId ? { ...f, parentId: targetFolderId } : f
        ));
        if (targetFolderId) {
            setFiles(prev => prev.map(f =>
                f.id === targetFolderId ? { ...f, isExpanded: true } : f
            ));
        }
    };

    const getFullPath = (node: FileNode, allFiles: FileNode[]): string => {
        let path = node.name;
        let current = node;
        while (current.parentId) {
            const parent = allFiles.find(f => f.id === current.parentId);
            if (!parent) break;
            path = `${parent.name}/${path}`;
            current = parent;
        }
        return path;
    };

    const getDir = (path: string): string => {
        const parts = path.split('/');
        parts.pop();
        return parts.join('/');
    };

    const resolveRelativePath = (baseDir: string, relativePath: string): string => {
        if (relativePath.startsWith('/')) return relativePath.slice(1);
        const parts = baseDir ? baseDir.split('/') : [];
        const relParts = relativePath.split('/');
        for (const part of relParts) {
            if (part === '..') parts.pop();
            else if (part !== '.' && part !== '') parts.push(part);
        }
        return parts.join('/');
    };

    const handleFormat = async () => {
        if (editorRef.current) {
            try {
                // Ensure the editor has focus before running formatting
                editorRef.current.focus();
                await editorRef.current.getAction('editor.action.formatDocument').run();
                const formattedValue = editorRef.current.getValue();
                handleEditorChange(formattedValue);
            } catch (err) {
                console.error("Formatting failed:", err);
            }
        }
    };

    // Load code from Supabase / localStorage on mount
    useEffect(() => {
        const loadCode = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            const sanitizedTitle = challengeData.instructions.slice(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const challengeId = `web_ide_${sanitizedTitle}`;

            if (user) {
                const { data, error } = await supabase
                    .from('user_challenge_files')
                    .select('files_content')
                    .eq('user_id', user.id)
                    .eq('challenge_id', challengeId)
                    .maybeSingle();

                if (data && data.files_content) {
                    const content = data.files_content as any;
                    if (Array.isArray(content)) {
                        setFiles(content);
                    } else {
                        // Migration
                        setFiles(getInitialProject().map(f => {
                            if (f.id === 'index.html' && content.html) return { ...f, content: content.html };
                            if (f.id === 'style.css' && content.css) return { ...f, content: content.css };
                            if (f.id === 'script.js' && content.js) return { ...f, content: content.js };
                            return f;
                        }));
                    }
                }
            } else {
                const storageKey = `skloop_web_challenge_${challengeId}`;
                const savedData = localStorage.getItem(storageKey);
                if (savedData) {
                    try {
                        const parsed = JSON.parse(savedData);
                        if (Array.isArray(parsed)) setFiles(parsed);
                    } catch (e) { console.error(e); }
                }
            }
        };
        loadCode();
    }, [challengeData]);

    // Cloud Auto-Sync Logic (Debounced)
    useEffect(() => {
        const syncTimeout = setTimeout(async () => {
            const storageKey = `skloop_web_challenge_web_ide_${challengeData.instructions.slice(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
            localStorage.setItem(storageKey, JSON.stringify(files));

            setSaveStatus("saving");
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                const sanitizedTitle = challengeData.instructions.slice(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const challengeId = `web_ide_${sanitizedTitle}`;

                const { error } = await supabase
                    .from('user_challenge_files')
                    .upsert({
                        user_id: user.id,
                        challenge_id: challengeId,
                        files_content: files,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id,challenge_id' });

                if (!error) {
                    setSaveStatus("saved");
                    setTimeout(() => setSaveStatus("idle"), 2000);
                } else {
                    console.error("Cloud Sync Error:", error);
                    setSaveStatus("idle");
                }
            } else {
                setSaveStatus("saved");
                setTimeout(() => setSaveStatus("idle"), 2000);
            }
        }, 3000);

        return () => clearTimeout(syncTimeout);
    }, [files, challengeData]);

    const handleSave = async () => {
        setSaveStatus("saving");
        setIsSaving(true);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const sanitizedTitle = challengeData.instructions.slice(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const challengeId = `web_ide_${sanitizedTitle}`;

        if (user) {
            const { error } = await supabase
                .from('user_challenge_files')
                .upsert({
                    user_id: user.id,
                    challenge_id: challengeId,
                    files_content: files,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,challenge_id' });

            if (error) {
                console.error("Cloud Save Error:", error);
                alert("Failed to save to cloud: " + error.message);
            } else {
                setSaveStatus("saved");
                setTimeout(() => setSaveStatus("idle"), 2000);
            }
        } else {
            const storageKey = `skloop_web_challenge_${challengeId}`;
            localStorage.setItem(storageKey, JSON.stringify(files));
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
        }
        setIsSaving(false);
    };

    // Message Listener for Console
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'console-log') {
                setLogs(prev => [...prev.slice(-49), { type: 'log', message: event.data.message }]);
            } else if (event.data.type === 'console-error') {
                setLogs(prev => [...prev.slice(-49), { type: 'error', message: event.data.message }]);
            } else if (event.data.type === 'console-warn') {
                setLogs(prev => [...prev.slice(-49), { type: 'warn', message: event.data.message }]);
            } else if (event.data.type === 'console-clear') {
                setLogs([]);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Real-time update for preview
    useEffect(() => {
        const timeout = setTimeout(() => {
            // Find the best entry point
            let indexFile = files.find(f => f.name === 'index.html' && !f.parentId); // Root index first
            if (!indexFile) indexFile = files.find(f => f.name === 'index.html'); // Any index
            if (!indexFile) {
                const activeFile = files.find(f => f.id === activeTab);
                if (activeFile?.name.endsWith('.html')) indexFile = activeFile;
            }
            if (!indexFile) indexFile = files.find(f => f.name.endsWith('.html'));

            if (!indexFile) return;

            let html = indexFile.content || "";
            const htmlLower = html.trim().toLowerCase();
            const isFullHtml = htmlLower.startsWith("<!doctype") || htmlLower.startsWith("<html");

            // Build maps for path-based and fuzzy lookups
            const pathMap: Record<string, string> = {};
            const fuzzyMap: Record<string, string> = {};
            files.forEach(f => {
                if (f.type === 'file') {
                    const fullPath = getFullPath(f, files);
                    pathMap[fullPath] = f.content || "";
                    fuzzyMap[f.name] = f.content || "";
                }
            });

            const entryPath = getFullPath(indexFile, files);
            const entryDir = getDir(entryPath);

            const consoleScript = `
            <script>
                const oldLog = console.log;
                const oldError = console.error;
                const oldWarn = console.warn;
                window.parent.postMessage({ type: 'console-clear' }, '*');
                console.log = (...args) => {
                    oldLog.apply(console, args);
                    window.parent.postMessage({ type: 'console-log', message: args.map(a => String(a)).join(' ') }, '*');
                };
                console.error = (...args) => {
                    oldError.apply(console, args);
                    window.parent.postMessage({ type: 'console-error', message: args.map(a => String(a)).join(' ') }, '*');
                };
                console.warn = (...args) => {
                    oldWarn.apply(console, args);
                    window.parent.postMessage({ type: 'console-warn', message: args.map(a => String(a)).join(' ') }, '*');
                };
            </script>`;

            const resolveInjection = (content: string) => {
                let resolved = content;

                // Resolve CSS links
                const styleTags = content.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi) || [];
                styleTags.forEach(tag => {
                    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
                    if (hrefMatch) {
                        const rawHref = hrefMatch[1];
                        const normalizedHref = rawHref.startsWith('/') ? rawHref.slice(1) : resolveRelativePath(entryDir, rawHref);

                        let cssContent = pathMap[normalizedHref] || pathMap[rawHref.replace(/^\.\//, '')];
                        if (!cssContent) {
                            // Fallback fuzzy match (if file named style.css exists anywhere)
                            const fileName = rawHref.split('/').pop() || "";
                            if (fuzzyMap[fileName]) cssContent = fuzzyMap[fileName];
                        }

                        if (cssContent) {
                            resolved = resolved.split(tag).join(`<style>${cssContent}</style>`);
                        }
                    }
                });

                // Resolve JS scripts
                const scriptTags = content.match(/<script[^>]+src=["']([^"']+)["'][^>]*>[\s\S]*?<\/script>/gi) || [];
                scriptTags.forEach(tag => {
                    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
                    if (srcMatch) {
                        const rawSrc = srcMatch[1];
                        const normalizedSrc = rawSrc.startsWith('/') ? rawSrc.slice(1) : resolveRelativePath(entryDir, rawSrc);

                        let jsContent = pathMap[normalizedSrc] || pathMap[rawSrc.replace(/^\.\//, '')];
                        if (!jsContent) {
                            const fileName = rawSrc.split('/').pop() || "";
                            if (fuzzyMap[fileName]) jsContent = fuzzyMap[fileName];
                        }

                        if (jsContent) {
                            resolved = resolved.split(tag).join(`<script>${jsContent}</script>`);
                        }
                    }
                });

                return resolved;
            };

            let finalHtml = resolveInjection(html);

            // Fallback skloop magic (if no styles were explicitly resolved)
            if (!finalHtml.includes('<style>')) {
                const rootCss = files.find(f => f.name === 'style.css' && !f.parentId);
                const anyCss = rootCss || files.find(f => f.name.endsWith('.css'));
                if (anyCss?.content) {
                    if (finalHtml.includes('</head>')) finalHtml = finalHtml.replace('</head>', `<style>${anyCss.content}</style></head>`);
                    else finalHtml += `<style>${anyCss.content}</style>`;
                }
            }

            if (isFullHtml) {
                finalHtml = finalHtml.replace("<head>", `<head>${consoleScript}`);
            } else {
                finalHtml = `
                    <!DOCTYPE html>
                    <html>
                        <head>
                            ${consoleScript}
                        </head>
                        <body>
                            ${finalHtml}
                        </body>
                    </html>
                `;
            }
            setSrcDoc(finalHtml);
        }, 500);

        return () => clearTimeout(timeout);
    }, [files, activeTab]);

    const handleEditorChange = (value: string | undefined) => {
        const val = value || "";
        setFiles(prev => prev.map(f => f.id === activeTab ? { ...f, content: val } : f));
    };

    const handleEditorWillMount = (monaco: any) => {
        monaco.editor.defineTheme('skloop-theme', skloopTheme);
        emmetHTML(monaco);
        emmetCSS(monaco);
    };

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        editor.onDidChangeModelContent((event: any) => {
            const changes = event.changes;
            for (const change of changes) {
                if (change.text === '>') {
                    const model = editor.getModel();
                    if (!model) return;

                    const position = editor.getPosition();
                    if (!position) return;

                    const lineContent = model.getLineContent(position.lineNumber);
                    const textBefore = lineContent.substring(0, position.column - 1);

                    const match = textBefore.match(/<([a-zA-Z1-6]+)(?:\s+[^>]*?)?>$/);

                    if (match) {
                        const tagName = match[1];
                        const voidTags = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];

                        if (!voidTags.includes(tagName.toLowerCase()) && !textBefore.endsWith('/>')) {
                            const closingTag = `</${tagName}>`;
                            editor.executeEdits('auto-close-tag', [{
                                range: new monaco.Range(
                                    position.lineNumber,
                                    position.column,
                                    position.lineNumber,
                                    position.column
                                ),
                                text: closingTag,
                                forceMoveMarkers: true
                            }]);
                            editor.setPosition(position);
                        }
                    }
                }
            }
        });
    };

    const handleVerify = async () => {
        setIsValidating(true);
        // Simulate validation - In a real app, you would run validationRules here
        setTimeout(() => {
            setIsPassed(true);
            setIsValidating(false);
            onComplete();
        }, 1500);
    };

    return (
        <div className="flex flex-col h-[var(--app-h)] bg-[#FDFCF8] relative overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-zinc-100 h-14 flex items-center justify-between px-6 z-30 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#D4F268] rounded-xl flex items-center justify-center rotate-3 shadow-md">
                        <Code size={18} className="text-zinc-900" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-zinc-900">Skloop IDE</h2>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Web Track • Challenge</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-zinc-50 p-1 rounded-xl border border-zinc-100">
                        <button onClick={() => setPreviewDevice("mobile")} className={`p-1.5 rounded-lg transition-all ${previewDevice === 'mobile' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400"}`}><Smartphone size={14} /></button>
                        <button onClick={() => setPreviewDevice("tablet")} className={`p-1.5 rounded-lg transition-all ${previewDevice === 'tablet' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400"}`}><Tablet size={14} /></button>
                        <button onClick={() => setPreviewDevice("desktop")} className={`p-1.5 rounded-lg transition-all ${previewDevice === 'desktop' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400"}`}><Laptop size={14} /></button>
                    </div>

                    <div className="flex items-center gap-2 border-l border-zinc-100 pl-4">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${saveStatus === "saved" ? "bg-emerald-500 text-white" : "bg-zinc-900 text-white hover:scale-105"}`}
                        >
                            <Save size={14} className={isSaving ? "animate-spin" : ""} />
                            {saveStatus === "saved" ? "Saved!" : isSaving ? "Saving..." : "Save"}
                        </button>
                        <button
                            onClick={handleVerify}
                            disabled={isValidating}
                            className={`bg-[#D4F268] text-zinc-900 px-6 py-2 rounded-xl text-xs font-black hover:scale-105 transition-all shadow-lg shadow-[#D4F268]/20 flex items-center gap-2`}
                        >
                            {isValidating ? <RefreshCw size={14} className="animate-spin" /> : isPassed ? <CheckCircle size={14} /> : <Play size={14} />}
                            {isPassed ? "Pass!" : "Verify & Run"}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
                {/* File Sidebar */}
                <AnimatePresence>
                    {showSidebar && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 220, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="bg-zinc-50 border-r border-zinc-200 flex flex-col h-full overflow-hidden shrink-0"
                        >
                            <div className="px-3 py-2.5 border-b border-zinc-100 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Explorer</span>
                                    {selectedFolderId && (
                                        <span className="text-[9px] font-bold text-lime-600 bg-lime-50 border border-lime-200 px-1.5 py-0.5 rounded-full truncate max-w-[70px]">
                                            {files.find(f => f.id === selectedFolderId)?.name}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <button
                                        onClick={() => setIsCreating({ type: 'file', parentId: selectedFolderId })}
                                        className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                                        title={selectedFolderId ? `New file in ${files.find(f => f.id === selectedFolderId)?.name}` : "New file"}
                                    ><FilePlus size={13} /></button>
                                    <button
                                        onClick={() => setIsCreating({ type: 'folder', parentId: selectedFolderId })}
                                        className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                                        title={selectedFolderId ? `New folder in ${files.find(f => f.id === selectedFolderId)?.name}` : "New folder"}
                                    ><FolderPlus size={13} /></button>
                                    <button onClick={() => setShowSidebar(false)} className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"><ChevronLeft size={13} /></button>
                                </div>
                            </div>

                            {/* Root drop zone */}
                            <div
                                className={cn(
                                    "flex-1 overflow-y-auto p-2 no-scrollbar transition-colors",
                                    dragOverId === 'root' && "bg-lime-50"
                                )}
                                onDragOver={(e) => { e.preventDefault(); setDragOverId('root'); }}
                                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (draggingId) moveFile(draggingId, null);
                                    setDraggingId(null);
                                    setDragOverId(null);
                                }}
                                onClick={() => setSelectedFolderId(null)}
                            >
                                <AnimatePresence initial={false}>
                                    {isCreating && isCreating.parentId === null && (
                                        <motion.div
                                            key="root-input"
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="mb-1 overflow-hidden"
                                        >
                                            <div className="px-1 py-1">
                                                <input
                                                    autoFocus
                                                    className="bg-white border-2 border-lime-400 rounded-lg px-2 py-1.5 text-xs w-full outline-none font-bold"
                                                    value={newItemName}
                                                    onChange={(e) => setNewItemName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && newItemName.trim()) addFile(isCreating.type, null, newItemName.trim());
                                                        if (e.key === 'Escape') { setIsCreating(null); setNewItemName(""); }
                                                    }}
                                                    onBlur={() => { setIsCreating(null); setNewItemName(""); }}
                                                    placeholder={isCreating.type === 'file' ? "filename.html" : "folder-name"}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <div className="space-y-0.5">
                                    {files.filter(f => f.parentId === null).map(node => (
                                        <FileTreeItem
                                            key={node.id}
                                            node={node}
                                            files={files}
                                            activeTab={activeTab}
                                            setActiveTab={setActiveTab}
                                            toggleFolder={toggleFolder}
                                            editingId={editingId}
                                            setEditingId={setEditingId}
                                            newItemName={newItemName}
                                            setNewItemName={setNewItemName}
                                            renameFile={renameFile}
                                            deleteFile={deleteFile}
                                            isCreating={isCreating}
                                            setIsCreating={setIsCreating}
                                            addFile={addFile}
                                            selectedFolderId={selectedFolderId}
                                            setSelectedFolderId={setSelectedFolderId}
                                            draggingId={draggingId}
                                            setDraggingId={setDraggingId}
                                            dragOverId={dragOverId}
                                            setDragOverId={setDragOverId}
                                            moveFile={moveFile}
                                        />
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {!showSidebar && (
                    <button
                        onClick={() => setShowSidebar(true)}
                        className="w-8 bg-zinc-50 border-r border-zinc-200 flex items-start justify-center pt-6 text-zinc-400 hover:text-zinc-900 transition-colors shrink-0"
                    >
                        <ChevronRight size={14} />
                    </button>
                )}

                {/* Editor + Preview Container */}
                <div className="flex-1 flex min-w-0 relative">
                    {/* Monaco Editor Pane */}
                    <motion.div
                        animate={{
                            width: fullscreenPane === 'editor' ? '100%' : fullscreenPane === 'preview' ? '0%' : `${dividerPosition}%`,
                            opacity: fullscreenPane === 'preview' ? 0 : 1,
                            pointerEvents: fullscreenPane === 'preview' ? 'none' : 'auto'
                        }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="flex flex-col bg-white overflow-hidden border-r border-zinc-200 group relative"
                    >
                        <div className="bg-zinc-50 border-b border-zinc-100 px-4 py-2 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                                <FileText size={14} className="text-zinc-400" />
                                <span className="text-[10px] font-black text-zinc-900 uppercase tracking-widest truncate">
                                    {files.find(f => f.id === activeTab)?.name || 'Editor'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={handleFormat} className="p-1.5 text-zinc-400 hover:text-zinc-900 transition-colors" title="Format Code"><Wand2 size={14} /></button>
                                <button
                                    onClick={() => setFullscreenPane(fullscreenPane === 'editor' ? null : 'editor')}
                                    className={cn("p-1.5 rounded-lg transition-all", fullscreenPane === 'editor' ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-400 hover:bg-zinc-200')}
                                    title="Fullscreen Editor"
                                >
                                    <Maximize2 size={14} />
                                </button>
                                <button
                                    onClick={() => setShowLogs(!showLogs)}
                                    className={cn("p-1.5 rounded-lg transition-all", showLogs ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-400 hover:bg-zinc-200')}
                                    title="Toggle console"
                                >
                                    <Layout size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0">
                            <MonacoEditor
                                height="100%"
                                language={files.find(f => f.id === activeTab)?.language || "html"}
                                value={files.find(f => f.id === activeTab)?.content || ""}
                                onChange={handleEditorChange}
                                theme="skloop-theme"
                                beforeMount={handleEditorWillMount}
                                onMount={handleEditorDidMount}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    lineNumbers: "on",
                                    roundedSelection: true,
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    padding: { top: 20 },
                                    cursorBlinking: "smooth",
                                    renderLineHighlight: 'none',
                                    guides: { indentation: false, bracketPairs: false },
                                    occurrencesHighlight: 'off' as any,
                                    selectionHighlight: false,
                                    folding: false,
                                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                    wordWrap: 'on',
                                }}
                            />
                        </div>
                    </motion.div>

                    {/* Resize Handle */}
                    {!fullscreenPane && (
                        <div
                            onMouseDown={startResizing}
                            className={cn(
                                "w-1 hover:w-2 bg-transparent hover:bg-lime-400/50 absolute top-0 bottom-0 z-50 cursor-col-resize transition-all duration-300 group/resizer",
                                isResizing && "w-2 bg-lime-400 bg-opacity-100"
                            )}
                            style={{ left: `calc(${dividerPosition}% - 2px)` }}
                        >
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-8 bg-white border border-zinc-200 rounded-full flex items-center justify-center opacity-0 group-hover/resizer:opacity-100 transition-opacity">
                                <div className="w-0.5 h-3 bg-zinc-300 rounded-full" />
                            </div>
                        </div>
                    )}

                    {/* Preview Pane */}
                    <motion.div
                        animate={{
                            width: fullscreenPane === 'preview' ? '100%' : fullscreenPane === 'editor' ? '0%' : `${100 - dividerPosition}%`,
                            opacity: fullscreenPane === 'editor' ? 0 : 1,
                            pointerEvents: fullscreenPane === 'editor' ? 'none' : 'auto'
                        }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="flex flex-col bg-[#F8F9FA] overflow-hidden group"
                    >
                        <div className="bg-white border-b border-zinc-100 px-4 py-2 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 bg-zinc-50 px-3 py-1 rounded-full border border-zinc-200">
                                <Eye size={12} className="text-zinc-400" />
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Live View</span>
                            </div>
                            <button
                                onClick={() => setFullscreenPane(fullscreenPane === 'preview' ? null : 'preview')}
                                className={cn("p-1.5 rounded-lg transition-all", fullscreenPane === 'preview' ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-400 hover:bg-zinc-200')}
                                title="Fullscreen Preview"
                            >
                                <Maximize2 size={14} />
                            </button>
                        </div>
                        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden bg-zinc-100/50">
                            <motion.div
                                animate={{
                                    width: previewDevice === 'mobile' ? 375 : previewDevice === 'tablet' ? 768 : '100%',
                                    height: previewDevice === 'mobile' ? 667 : '100%',
                                }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className={cn(
                                    "bg-white overflow-hidden shadow-2xl transition-all duration-500",
                                    previewDevice === 'desktop' ? 'rounded-none border-none shadow-none w-full h-full' : 'rounded-[2rem] border-8 border-zinc-900'
                                )}
                            >
                                <iframe
                                    key={previewKey}
                                    ref={iframeRef}
                                    srcDoc={srcDoc}
                                    title="preview"
                                    className="w-full h-full border-none"
                                    sandbox="allow-scripts"
                                />
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Console Pane */}
            <AnimatePresence>
                {showLogs && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 200 }}
                        exit={{ height: 0 }}
                        className="bg-[#1A1A1A] border-t border-zinc-800 flex flex-col z-40"
                    >
                        <div className="px-6 py-2 border-b border-zinc-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#D4F268]" />
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Debug Console</span>
                            </div>
                            <button
                                onClick={() => setLogs([])}
                                className="text-zinc-500 hover:text-white transition-colors"
                            >
                                <RotateCcw size={12} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1.5 no-scrollbar">
                            {logs.map((log, i) => (
                                <div key={i} className={`flex gap-3 ${log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-yellow-400' : 'text-zinc-300'}`}>
                                    <span className="text-zinc-700 select-none">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                                    <span className="flex-1 break-all">{log.message}</span>
                                </div>
                            ))}
                            {logs.length === 0 && <div className="text-zinc-600 italic text-[10px] uppercase tracking-widest">Waiting for output...</div>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function FileTreeItem({
    node, files, activeTab, setActiveTab, toggleFolder,
    editingId, setEditingId, newItemName, setNewItemName,
    renameFile, deleteFile, isCreating, setIsCreating, addFile,
    selectedFolderId, setSelectedFolderId,
    draggingId, setDraggingId, dragOverId, setDragOverId, moveFile,
}: any) {
    const children = files.filter((f: any) => f.parentId === node.id);
    const isFolder = node.type === 'folder';
    const isActive = activeTab === node.id;
    const isSelectedFolder = selectedFolderId === node.id;
    const isDraggingThis = draggingId === node.id;
    const isDragTarget = dragOverId === node.id;

    const fileColor = node.name.endsWith('.html')
        ? 'text-orange-400'
        : node.name.endsWith('.css')
        ? 'text-sky-400'
        : node.name.endsWith('.js')
        ? 'text-yellow-400'
        : 'text-zinc-400';

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            toggleFolder(node.id);
            setSelectedFolderId(node.id === selectedFolderId ? null : node.id);
        } else {
            setActiveTab(node.id);
            setSelectedFolderId(null);
        }
    };

    return (
        <div className="w-full">
            <motion.div
                layout
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: isDraggingThis ? 0.35 : 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.15 }}
                draggable
                onDragStart={(e) => {
                    e.stopPropagation();
                    setDraggingId(node.id);
                    (e as any).dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isFolder && draggingId !== node.id) setDragOverId(node.id);
                }}
                onDragLeave={(e) => {
                    e.stopPropagation();
                    if (dragOverId === node.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (draggingId && draggingId !== node.id && isFolder) {
                        moveFile(draggingId, node.id);
                    }
                    setDraggingId(null);
                    setDragOverId(null);
                }}
                onClick={handleClick}
                className={cn(
                    "group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer select-none",
                    isActive && !isFolder
                        ? "bg-[#D4F268] text-zinc-900 shadow-sm"
                        : isSelectedFolder
                        ? "bg-lime-100 text-zinc-900 border border-lime-300"
                        : isDragTarget
                        ? "bg-lime-50 border border-lime-400 border-dashed"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                )}
            >
                {/* Animated chevron for folders */}
                {isFolder ? (
                    <motion.div
                        animate={{ rotate: node.isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.18, ease: 'easeInOut' }}
                        className="shrink-0 text-zinc-400"
                    >
                        <ChevronRight size={13} />
                    </motion.div>
                ) : (
                    <span className="w-[13px] shrink-0" />
                )}

                {/* Icon */}
                {isFolder ? (
                    <span className="shrink-0">
                        {node.isExpanded
                            ? <FolderOpen size={14} className="text-amber-400" />
                            : <Folder size={14} className="text-amber-400" />
                        }
                    </span>
                ) : (
                    <FileText size={13} className={cn("shrink-0", fileColor)} />
                )}

                {/* Name / inline rename input */}
                {editingId === node.id ? (
                    <input
                        autoFocus
                        className="bg-white border-2 border-lime-400 rounded px-1 outline-none w-full text-xs font-bold text-black"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && newItemName.trim()) renameFile(node.id, newItemName.trim());
                            if (e.key === 'Escape') { setEditingId(null); setNewItemName(""); }
                        }}
                        onBlur={() => { setEditingId(null); setNewItemName(""); }}
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className="flex-1 truncate">{node.name}</span>
                )}

                {/* Action buttons (visible on hover) */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
                    {isFolder && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsCreating({ type: 'file', parentId: node.id }); setSelectedFolderId(node.id); if (!node.isExpanded) toggleFolder(node.id); }}
                                className="p-0.5 hover:bg-zinc-200 rounded text-zinc-400 hover:text-zinc-900"
                                title="New file here"
                            ><FilePlus size={11} /></button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsCreating({ type: 'folder', parentId: node.id }); setSelectedFolderId(node.id); if (!node.isExpanded) toggleFolder(node.id); }}
                                className="p-0.5 hover:bg-zinc-200 rounded text-zinc-400 hover:text-zinc-900"
                                title="New folder here"
                            ><FolderPlus size={11} /></button>
                        </>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(node.id); setNewItemName(node.name); }}
                        className="p-0.5 hover:bg-zinc-200 rounded text-zinc-400 hover:text-zinc-900"
                        title="Rename"
                    ><Edit2 size={11} /></button>
                    <button
                        onClick={(e) => { e.stopPropagation(); deleteFile(node.id); }}
                        className="p-0.5 hover:bg-red-100 rounded text-zinc-300 hover:text-red-500"
                        title="Delete"
                    ><Trash size={11} /></button>
                </div>
            </motion.div>

            {/* Children (animated expand/collapse) */}
            {isFolder && (
                <AnimatePresence initial={false}>
                    {node.isExpanded && (
                        <motion.div
                            key="children"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="overflow-hidden"
                        >
                            <div className="ml-3 pl-2 border-l-2 border-zinc-100 mt-0.5 space-y-0.5">
                                <AnimatePresence initial={false}>
                                    {isCreating && isCreating.parentId === node.id && (
                                        <motion.div
                                            key="folder-input"
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.15 }}
                                            className="overflow-hidden py-1 pr-1"
                                        >
                                            <input
                                                autoFocus
                                                className="bg-white border-2 border-lime-400 rounded-lg px-2 py-1 text-xs w-full outline-none font-bold"
                                                value={newItemName}
                                                onChange={(e) => setNewItemName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && newItemName.trim()) addFile(isCreating.type, node.id, newItemName.trim());
                                                    if (e.key === 'Escape') { setIsCreating(null); setNewItemName(""); }
                                                }}
                                                onBlur={() => { setIsCreating(null); setNewItemName(""); }}
                                                placeholder={isCreating.type === 'file' ? "filename.html" : "folder-name"}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {children.length === 0 && !isCreating && (
                                    <p className="text-[10px] text-zinc-300 px-2 py-1 italic">Empty folder</p>
                                )}

                                {children.map((child: any) => (
                                    <FileTreeItem
                                        key={child.id}
                                        node={child}
                                        files={files}
                                        activeTab={activeTab}
                                        setActiveTab={setActiveTab}
                                        toggleFolder={toggleFolder}
                                        editingId={editingId}
                                        setEditingId={setEditingId}
                                        newItemName={newItemName}
                                        setNewItemName={setNewItemName}
                                        renameFile={renameFile}
                                        deleteFile={deleteFile}
                                        isCreating={isCreating}
                                        setIsCreating={setIsCreating}
                                        addFile={addFile}
                                        selectedFolderId={selectedFolderId}
                                        setSelectedFolderId={setSelectedFolderId}
                                        draggingId={draggingId}
                                        setDraggingId={setDraggingId}
                                        dragOverId={dragOverId}
                                        setDragOverId={setDragOverId}
                                        moveFile={moveFile}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            )}
        </div>
    );
}
