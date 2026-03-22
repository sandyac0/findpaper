"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
    Search,
    Download,
    Square,
    Trash2,
    FolderOpen,
    FileText,
    Loader2,
    ExternalLink,
    CheckCircle2,
    Star,
    AlertCircle,
    Database,
    Settings,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    LayoutGrid,
    List,
    Github,
    Code,
} from "lucide-react";

const DATA_SOURCES = [{
    id: "arxiv",
    name: "arXiv",
    domain: "arxiv.org",
    description: "预印本论文库，支持直接下载PDF",
    enabled: true
}, {
    id: "openalex",
    name: "OpenAlex",
    domain: "openalex.org",
    description: "开放学术图谱，覆盖最全面",
    enabled: true
}, {
    id: "scholar",
    name: "Google Scholar",
    domain: "scholar.google.com",
    description: "谷歌学术搜索引擎",
    enabled: true
}, {
    id: "semantic",
    name: "Semantic Scholar",
    domain: "semanticscholar.org",
    description: "AI驱动的学术搜索",
    enabled: true
}, {
    id: "pubmed",
    name: "PubMed",
    domain: "pubmed.ncbi.nlm.nih.gov",
    description: "生物医学文献数据库",
    enabled: true
}, {
    id: "acm",
    name: "ACM DL",
    domain: "dl.acm.org",
    description: "ACM数字图书馆",
    enabled: false
}, {
    id: "ieee",
    name: "IEEE Xplore",
    domain: "ieeexplore.ieee.org",
    description: "IEEE电子图书馆",
    enabled: false
}, {
    id: "springer",
    name: "Springer",
    domain: "springer.com",
    description: "Springer学术出版",
    enabled: false
}, {
    id: "elsevier",
    name: "ScienceDirect",
    domain: "sciencedirect.com",
    description: "Elsevier科学直通",
    enabled: false
}];

interface Paper {
    id: number;
    title: string;
    authors: string;
    year: string;
    source: string;
    url: string;
    pdfUrl?: string;
    codeUrl?: string;
    snippet: string;
    relevanceScore: number;
    selected: boolean;
    downloaded: boolean;
    downloadUrl?: string;
}

interface LogEntry {
    time: string;
    level: "info" | "success" | "error" | "warning";
    message: string;
}

export default function PaperSearchPage() {
    const [keywords, setKeywords] = useState("human pose estimation");
    const [startYear, setStartYear] = useState(2021);
    const [endYear, setEndYear] = useState(2024);
    const [maxResults, setMaxResults] = useState(10);
    const [maxPerSource, setMaxPerSource] = useState(50);
    const [downloadInterval, setDownloadInterval] = useState(2);
    const [openalexApiKey, setOpenalexApiKey] = useState("");
    const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set(DATA_SOURCES.filter(s => s.enabled).map(s => s.id)));
    const [showSourceSettings, setShowSourceSettings] = useState(false);
    const [downloadStartId, setDownloadStartId] = useState(1);
    const [downloadEndId, setDownloadEndId] = useState(999999);
    const [overwrite, setOverwrite] = useState(false);
    const [papers, setPapers] = useState<Paper[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    const [downloadProgress, setDownloadProgress] = useState({
        current: 0,
        total: 0
    });

    const abortControllerRef = useRef<AbortController | null>(null);
    const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10; // 每页显示条数
    const cardsContainerRef = useRef<HTMLDivElement>(null);
    const tableContentRef = useRef<HTMLDivElement>(null);
    const tableInnerRef = useRef<HTMLDivElement>(null);
    const scrollbarRef = useRef<HTMLDivElement>(null);
    const [tableScrollWidth, setTableScrollWidth] = useState(1000);
    const isScrollingTable = useRef(false);
    const isScrollingScrollbar = useRef(false);

    const updateScrollWidth = useCallback(() => {
        const targetRef = tableInnerRef.current || tableContentRef.current;

        if (targetRef) {
            const scrollWidth = targetRef.scrollWidth;

            if (scrollWidth > 0) {
                setTableScrollWidth(prev => {
                    return Math.max(scrollWidth, 1000);
                });
            }
        }
    }, []);

    useEffect(() => {
        if (papers.length > 0) {
            const timers = [50, 200, 500].map(delay => setTimeout(() => updateScrollWidth(), delay));
            return () => timers.forEach(clearTimeout);
        }
    }, [papers, updateScrollWidth]);

    useEffect(() => {
        const target = tableInnerRef.current;

        if (!target)
            return;

        const observer = new MutationObserver(() => {
            updateScrollWidth();
        });

        observer.observe(target, {
            childList: true,
            subtree: true
        });

        return () => observer.disconnect();
    }, [updateScrollWidth]);

    useEffect(() => {
        const handleResize = () => {
            updateScrollWidth();
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [updateScrollWidth]);

    const handleTableScroll = useCallback(() => {
        if (isScrollingScrollbar.current)
            return;

        isScrollingTable.current = true;

        if (tableContentRef.current && scrollbarRef.current) {
            scrollbarRef.current.scrollLeft = tableContentRef.current.scrollLeft;
        }

        requestAnimationFrame(() => {
            isScrollingTable.current = false;
        });
    }, []);

    const handleScrollbarScroll = useCallback(() => {
        if (isScrollingTable.current)
            return;

        isScrollingScrollbar.current = true;

        if (tableContentRef.current && scrollbarRef.current) {
            tableContentRef.current.scrollLeft = scrollbarRef.current.scrollLeft;
        }

        requestAnimationFrame(() => {
            isScrollingScrollbar.current = false;
        });
    }, []);

    const addLog = useCallback((level: LogEntry["level"], message: string) => {
        const time = new Date().toLocaleTimeString();

        setLogs(prev => [...prev, {
            time,
            level,
            message
        }]);
    }, []);

    const clearLogs = () => setLogs([]);

    useEffect(() => {
        setCurrentCardIndex(0);
        setCurrentPage(1); // 重置页码
    }, [papers]);

    const toggleSource = (sourceId: string) => {
        setSelectedSources(prev => {
            const newSet = new Set(prev);

            if (newSet.has(sourceId)) {
                newSet.delete(sourceId);
            } else {
                newSet.add(sourceId);
            }

            return newSet;
        });
    };

    const toggleAllSources = (select: boolean) => {
        if (select) {
            setSelectedSources(new Set(DATA_SOURCES.map(s => s.id)));
        } else {
            setSelectedSources(new Set());
        }
    };

    const scrollToCard = (index: number) => {
        if (index < 0 || index >= papers.length)
            return;

        setCurrentCardIndex(index);
    };

    const goToPrevCard = () => {
        scrollToCard(currentCardIndex - 1);
    };

    const goToNextCard = () => {
        scrollToCard(currentCardIndex + 1);
    };

    const searchPapers = async () => {
        if (!keywords.trim()) {
            addLog("error", "请输入关键词");
            return;
        }

        if (selectedSources.size === 0) {
            addLog("error", "请至少选择一个数据源");
            return;
        }

        setIsSearching(true);
        setPapers([]);
        abortControllerRef.current = new AbortController();
        const enabledSources = DATA_SOURCES.filter(s => selectedSources.has(s.id)).map(s => s.name).join(", ");
        addLog("info", `开始搜索: ${keywords}`);
        addLog("info", `年份范围: ${startYear} - ${endYear}`);
        addLog("info", `最大结果数: ${maxResults}`);
        addLog("info", `已选数据源: ${enabledSources}`);

        try {
            const response = await fetch("/api/papers/search", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    keywords,
                    startYear,
                    endYear,
                    maxResults,
                    maxPerSource,
                    sources: Array.from(selectedSources),
                    openalexApiKey
                }),

                signal: abortControllerRef.current.signal
            });

            if (!response.ok) {
                throw new Error("搜索请求失败");
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error("无法读取响应流");
            }

            let buffer = "";
            let allPapers: Paper[] = [];

            while (true) {
                const {
                    done,
                    value
                } = await reader.read();

                if (done)
                    break;

                buffer += decoder.decode(value, {
                    stream: true
                });

                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);

                        if (data === "[DONE]") {
                            continue;
                        }

                        try {
                            const parsed = JSON.parse(data);

                            if (parsed.type === "log") {
                                addLog(parsed.level, parsed.message);
                            } else if (parsed.type === "paper") {
                                allPapers.push({
                                    ...parsed.data,
                                    selected: true,
                                    downloaded: false
                                });

                                setPapers([...allPapers]);
                            }
                        } catch {}
                    }
                }
            }

            addLog("success", `搜索完成，共找到 ${allPapers.length} 篇论文（按相关性排序）`);
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                addLog("warning", "搜索已停止");
            } else {
                addLog("error", `搜索失败: ${error instanceof Error ? error.message : "未知错误"}`);
            }
        } finally {
            setIsSearching(false);
        }
    };

    const downloadPapers = async () => {
        const selectedPapers = papers.filter(p => p.selected && !p.downloaded && p.pdfUrl);

        if (selectedPapers.length === 0) {
            addLog("warning", "没有可下载的论文（需要有 PDF 链接）");
            return;
        }

        setIsDownloading(true);

        setDownloadProgress({
            current: 0,
            total: selectedPapers.length
        });

        abortControllerRef.current = new AbortController();
        addLog("info", `开始下载 ${selectedPapers.length} 篇论文...`);

        for (let i = 0; i < selectedPapers.length; i++) {
            if (!isDownloading && i > 0)
                break;

            const paper = selectedPapers[i];

            addLog(
                "info",
                `正在下载 (${i + 1}/${selectedPapers.length}): ${paper.title.substring(0, 50)}...`
            );

            try {
                const response = await fetch("/api/papers/download", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        paper,
                        overwrite,
                        directDownload: true
                    }),

                    signal: abortControllerRef.current.signal
                });

                const result = await response.json();

                if (result.success) {
                    addLog("success", `下载成功: ${paper.title.substring(0, 50)}...`);

                    setPapers(prev => prev.map(p => p.id === paper.id ? {
                        ...p,
                        downloaded: true,
                        downloadUrl: result.downloadUrl
                    } : p));
                } else if (result.fallbackUrl) {
                    addLog("warning", `自动下载失败，请手动下载: ${paper.title.substring(0, 30)}...`);
                    window.open(result.fallbackUrl, "_blank");

                    setPapers(prev => prev.map(p => p.id === paper.id ? {
                        ...p,
                        downloaded: true
                    } : p));
                } else {
                    addLog("error", `下载失败: ${result.error}`);
                }
            } catch (error) {
                if (error instanceof Error && error.name === "AbortError") {
                    addLog("warning", "下载已停止");
                    break;
                }

                addLog("error", `下载失败: ${error instanceof Error ? error.message : "未知错误"}`);
            }

            setDownloadProgress({
                current: i + 1,
                total: selectedPapers.length
            });

            if (downloadInterval > 0 && i < selectedPapers.length - 1) {
                addLog("info", `等待 ${downloadInterval} 秒后继续下载...`);
                await new Promise(resolve => setTimeout(resolve, downloadInterval * 1000));
            }
        }

        setIsDownloading(false);
        addLog("info", "下载任务完成");
    };

    const searchAndDownload = async () => {
        await searchPapers();

        setTimeout(() => {
            if (papers.length > 0) {
                downloadPapers();
            }
        }, 1000);
    };

    const stopOperation = () => {
        abortControllerRef.current?.abort();
        addLog("warning", "正在停止操作...");
    };

    const togglePaperSelection = (id: number) => {
        setPapers(prev => prev.map(p => p.id === id ? {
            ...p,
            selected: !p.selected
        } : p));
    };

    const toggleSelectAll = () => {
        const allSelected = papers.every(p => p.selected);

        setPapers(prev => prev.map(p => ({
            ...p,
            selected: !allSelected
        })));
    };

    const exportCSV = () => {
        const selectedPapers = papers.filter(p => p.selected);

        if (selectedPapers.length === 0) {
            addLog("warning", "没有选中的论文可导出");
            return;
        }

        const headers = ["ID", "标题", "作者", "年份", "来源", "相关性得分", "URL", "PDF链接", "摘要"];

        const rows = selectedPapers.map(p => [
            p.id,
            `"${p.title.replace(/"/g, "\"\"")}"`,
            `"${p.authors.replace(/"/g, "\"\"")}"`,
            p.year,
            p.source,
            p.relevanceScore,
            p.url,
            p.pdfUrl || "",
            `"${p.snippet.replace(/"/g, "\"\"")}"`
        ]);

        const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

        const blob = new Blob(["﻿" + csv], {
            type: "text/csv;charset=utf-8"
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `papers_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        addLog("success", `已导出 ${selectedPapers.length} 篇论文到 CSV`);
    };

    const downloadSinglePaperDirect = async (paper: Paper) => {
        if (!paper.pdfUrl) {
            addLog("warning", "该论文没有可用的 PDF 链接");
            window.open(paper.url, "_blank");
            return;
        }

        addLog("info", `正在下载: ${paper.title.substring(0, 40)}...`);

        try {
            const response = await fetch(`/api/papers/download?url=${encodeURIComponent(paper.pdfUrl)}`);

            if (!response.ok) {
                throw new Error("下载失败");
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${paper.title.substring(0, 50).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            addLog("success", `已下载: ${paper.title.substring(0, 40)}...`);

            setPapers(prev => prev.map(p => p.id === paper.id ? {
                ...p,
                downloaded: true
            } : p));
        } catch {
            addLog("warning", `直接下载失败，正在打开 PDF 页面...`);
            window.open(paper.pdfUrl, "_blank");
        }
    };

    const getRelevanceBadge = (score: number) => {
        if (score >= 20) return {
            variant: "default" as const,
            className: "bg-green-600",
            label: "高相关"
        };

        if (score >= 10) return {
            variant: "secondary" as const,
            className: "bg-blue-500",
            label: "中相关"
        };

        return {
            variant: "outline" as const,
            className: "",
            label: "低相关"
        };
    };

    const renderPaperCard = (paper: Paper, index: number) => {
        const relevance = getRelevanceBadge(paper.relevanceScore);
        const isActive = index === currentCardIndex;

        return (
            <div
                key={paper.id}
                className={`flex-shrink-0 w-full md:w-[350px] transition-all duration-300 ${isActive ? "scale-100 opacity-100" : "scale-95 opacity-60"}`}>
                <Card className={`h-full ${paper.selected ? "ring-2 ring-blue-500" : ""}`}>
                    <CardContent className="p-4 flex flex-col h-full">
                        {}
                        <div className="flex items-start justify-between gap-2 mb-3">
                            <Badge variant="outline" className="shrink-0">#{paper.id}
                            </Badge>
                            <div className="flex gap-1">
                                <Checkbox
                                    checked={paper.selected}
                                    onCheckedChange={() => togglePaperSelection(paper.id)} />
                                <Badge variant={relevance.variant} className={relevance.className}>
                                    <Star className="w-3 h-3 mr-1" />
                                    {paper.relevanceScore}
                                </Badge>
                            </div>
                        </div>
                        {}
                        <h3 className="font-semibold text-sm mb-2 line-clamp-2 flex-grow">
                            <a
                                href={paper.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline">
                                {paper.title}
                            </a>
                        </h3>
                        {}
                        <div className="flex flex-wrap gap-2 mb-3">
                            <Badge variant="secondary" className="text-xs">
                                {paper.source}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                                {paper.year}
                            </Badge>
                            {paper.downloaded && <Badge className="bg-green-600 text-xs">
                                <CheckCircle2 className="w-3 h-3 mr-1" />已下载
                                                </Badge>}
                        </div>
                        {}
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 mb-3">
                            {paper.snippet}
                        </p>
                        {}
                        <p className="text-xs text-slate-500 mb-3 truncate">
                            <span className="font-medium">作者：</span>
                            {paper.authors}
                        </p>
                        {}
                        <div className="flex gap-2 mt-auto pt-2 border-t">
                            {paper.pdfUrl ? <Button
                                size="sm"
                                onClick={() => downloadSinglePaperDirect(paper)}
                                disabled={paper.downloaded}
                                className="flex-1">
                                <Download className="w-4 h-4 mr-1" />
                                {paper.downloaded ? "已下载" : "下载PDF"}
                            </Button> : <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(paper.url, "_blank")}
                                className="flex-1">
                                <ExternalLink className="w-4 h-4 mr-1" />手动下载
                                                </Button>}
                            {paper.codeUrl && <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(paper.codeUrl, "_blank")}
                                className="text-purple-600 hover:text-purple-700"
                                title="查看代码">
                                <Github className="w-4 h-4" />
                            </Button>}
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(paper.url, "_blank")}>
                                <ExternalLink className="w-4 h-4" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    };

    return (
        <div
            className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 md:p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">学术论文检索与下载系统
                                  </h1>
                    <p className="text-slate-600 dark:text-slate-400">支持多数据源并行搜索，结果按关键词相关性自动排序
                                  </p>
                </div>
                {}
                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Search className="w-5 h-5" />查询与基础参数
                                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {}
                            <div className="lg:col-span-2">
                                <Label htmlFor="keywords">关键词 (用逗号分隔)</Label>
                                <Input
                                    id="keywords"
                                    value={keywords}
                                    onChange={e => setKeywords(e.target.value)}
                                    placeholder="输入关键词，如: deep learning, neural network"
                                    className="mt-1.5" />
                            </div>
                            {}
                            <div>
                                <Label htmlFor="startYear">起始年份</Label>
                                <Input
                                    id="startYear"
                                    type="number"
                                    value={startYear}
                                    onChange={e => setStartYear(parseInt(e.target.value) || 2000)}
                                    className="mt-1.5" />
                            </div>
                            {}
                            <div>
                                <Label htmlFor="endYear">截止年份</Label>
                                <Input
                                    id="endYear"
                                    type="number"
                                    value={endYear}
                                    onChange={e => setEndYear(parseInt(e.target.value) || new Date().getFullYear())}
                                    className="mt-1.5" />
                            </div>
                            {}
                            <div>
                                <Label htmlFor="maxResults">最多保留</Label>
                                <Input
                                    id="maxResults"
                                    type="number"
                                    value={maxResults}
                                    onChange={e => setMaxResults(parseInt(e.target.value) || 10)}
                                    className="mt-1.5" />
                            </div>
                            {}
                            <div>
                                <Label htmlFor="maxPerSource">每个来源最大论文数</Label>
                                <Input
                                    id="maxPerSource"
                                    type="number"
                                    value={maxPerSource}
                                    onChange={e => setMaxPerSource(parseInt(e.target.value) || 50)}
                                    className="mt-1.5" />
                            </div>
                            {}
                            <div>
                                <Label htmlFor="downloadInterval">下载间隔时间 (秒)</Label>
                                <Input
                                    id="downloadInterval"
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={downloadInterval}
                                    onChange={e => setDownloadInterval(parseFloat(e.target.value) || 0)}
                                    className="mt-1.5" />
                                <p className="text-xs text-slate-500 mt-1">批量下载时的间隔时间，避免请求过快</p>
                            </div>
                            {}
                            <div className="lg:col-span-2">
                                <Label htmlFor="openalexApiKey" className="flex items-center gap-2">OpenAlex API Key
                                                      <Badge variant="outline" className="text-xs">可选</Badge>
                                </Label>
                                <Input
                                    id="openalexApiKey"
                                    type="password"
                                    value={openalexApiKey}
                                    onChange={e => setOpenalexApiKey(e.target.value)}
                                    placeholder="留空使用默认配置，填写可获得更高请求限制"
                                    className="mt-1.5 font-mono text-sm" />
                                <p className="text-xs text-slate-500 mt-1">获取 API Key: <a
                                        href="https://openalex.org/signup"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline">https://openalex.org/signup</a>
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                {}
                <Card>
                    <CardHeader className="pb-2">
                        <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => setShowSourceSettings(!showSourceSettings)}>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Database className="w-5 h-5" />数据源设置
                                                <Badge variant="secondary" className="ml-2">已选择 {selectedSources.size}/{DATA_SOURCES.length}
                                </Badge>
                            </CardTitle>
                            <Button variant="ghost" size="sm">
                                {showSourceSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                        </div>
                    </CardHeader>
                    {showSourceSettings && <CardContent className="pt-2">
                        <div className="flex gap-2 mb-4">
                            <Button variant="outline" size="sm" onClick={() => toggleAllSources(true)}>全选
                                                </Button>
                            <Button variant="outline" size="sm" onClick={() => toggleAllSources(false)}>取消全选
                                                </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedSources(new Set(["arxiv", "openalex", "scholar", "semantic", "pubmed"]))}>推荐组合
                                                </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            {DATA_SOURCES.map(source => <div
                                key={source.id}
                                className={`p-3 rounded-lg border transition-all cursor-pointer ${selectedSources.has(source.id) ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-slate-200 bg-white dark:bg-slate-900 hover:border-slate-300"}`}
                                onClick={() => toggleSource(source.id)}>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={selectedSources.has(source.id)}
                                        onCheckedChange={() => toggleSource(source.id)} />
                                    <div className="flex-1">
                                        <div className="font-medium text-sm">{source.name}</div>
                                        <div className="text-xs text-slate-500">{source.description}</div>
                                    </div>
                                </div>
                            </div>)}
                        </div>
                        <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                                <strong>提示：</strong>arXiv 支持直接下载 PDF，其他数据源可能需要跳转到原网站下载。
                                                  选择更多数据源会增加搜索时间，但能获得更全面的结果。
                                                </p>
                        </div>
                    </CardContent>}
                </Card>
                {}
                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Settings className="w-5 h-5" />输出设置
                                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {}
                            <div>
                                <Label>下载 ID 范围</Label>
                                <div className="flex gap-2 mt-1.5">
                                    <Input
                                        type="number"
                                        value={downloadStartId}
                                        onChange={e => setDownloadStartId(parseInt(e.target.value) || 1)} />
                                    <span className="flex items-center text-slate-500">-</span>
                                    <Input
                                        type="number"
                                        value={downloadEndId}
                                        onChange={e => setDownloadEndId(parseInt(e.target.value) || 999999)} />
                                </div>
                            </div>
                            {}
                            <div className="flex items-center gap-2 pt-6">
                                <Switch id="overwrite" checked={overwrite} onCheckedChange={setOverwrite} />
                                <Label htmlFor="overwrite" className="cursor-pointer">覆盖已存在文件
                                                    </Label>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                {}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-wrap gap-3">
                            <Button
                                variant="outline"
                                onClick={searchPapers}
                                disabled={isSearching || isDownloading}>
                                {isSearching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}仅检索
                                              </Button>
                            <Button
                                onClick={searchAndDownload}
                                disabled={isSearching || isDownloading}
                                className="bg-blue-600 hover:bg-blue-700">
                                {isSearching || isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}检索 + 下载
                                              </Button>
                            <Button
                                variant="outline"
                                onClick={downloadPapers}
                                disabled={isSearching || isDownloading || papers.length === 0}>
                                {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}批量下载
                                                {isDownloading && <span className="ml-2">({downloadProgress.current}/{downloadProgress.total})
                                                      </span>}
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={stopOperation}
                                disabled={!isSearching && !isDownloading}>
                                <Square className="w-4 h-4 mr-2" />停止
                                              </Button>
                            <div className="flex-1" />
                            <Button variant="outline" onClick={clearLogs}>
                                <Trash2 className="w-4 h-4 mr-2" />清空日志
                                              </Button>
                            <Button variant="outline" onClick={exportCSV} disabled={papers.length === 0}>
                                <FileText className="w-4 h-4 mr-2" />导出 CSV
                                              </Button>
                        </div>
                    </CardContent>
                </Card>
                {}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {}
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <FolderOpen className="w-5 h-5" />搜索结果
                                                      <Badge variant="secondary" className="ml-2">
                                        {papers.filter(p => p.selected).length}/{papers.length}
                                    </Badge>
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    {}
                                    <div className="flex border rounded-lg overflow-hidden">
                                        <Button
                                            variant={viewMode === "cards" ? "default" : "ghost"}
                                            size="sm"
                                            onClick={() => setViewMode("cards")}
                                            className="rounded-none">
                                            <LayoutGrid className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant={viewMode === "table" ? "default" : "ghost"}
                                            size="sm"
                                            onClick={() => setViewMode("table")}
                                            className="rounded-none">
                                            <List className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    {papers.length > 0 && <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                                        {papers.every(p => p.selected) ? "取消全选" : "全选"}
                                    </Button>}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {papers.length === 0 ? <div className="text-center text-slate-500 py-8">
                                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                                <p>暂无搜索结果</p>
                                <p className="text-sm mt-2">请点击"检索"按钮开始搜索论文</p>
                            </div> : viewMode === "cards" ? <div className="space-y-4">
                                {}
                                <div
                                    ref={cardsContainerRef}
                                    className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory scrollbar-hide"
                                    style={{
                                        scrollBehavior: "smooth"
                                    }}>
                                    {papers.map((paper, index) => renderPaperCard(paper, index))}
                                </div>
                                {}
                                <div className="flex items-center justify-between">
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={goToPrevCard}
                                            disabled={currentCardIndex === 0}>
                                            <ChevronLeft className="w-4 h-4 mr-1" />上一篇
                                                                  </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={goToNextCard}
                                            disabled={currentCardIndex === papers.length - 1}>下一篇
                                                                    <ChevronRight className="w-4 h-4 ml-1" />
                                        </Button>
                                    </div>
                                    {}
                                    <div className="flex items-center gap-1">
                                        {papers.length > 7 ? <>
                                            {Array.from({
                                                length: Math.min(5, papers.length)
                                            }, (_, i) => {
                                                let pageIndex: number;

                                                if (currentCardIndex < 3) {
                                                    pageIndex = i;
                                                } else if (currentCardIndex > papers.length - 4) {
                                                    pageIndex = papers.length - 5 + i;
                                                } else {
                                                    pageIndex = currentCardIndex - 2 + i;
                                                }

                                                return (
                                                    <button
                                                        key={pageIndex}
                                                        onClick={() => scrollToCard(pageIndex)}
                                                        className={`w-2 h-2 rounded-full transition-all ${pageIndex === currentCardIndex ? "bg-blue-600 w-4" : "bg-slate-300 hover:bg-slate-400"}`} />
                                                );
                                            })}
                                            {currentCardIndex < papers.length - 4 && <span className="px-1 text-slate-400">...</span>}
                                            <button
                                                onClick={() => scrollToCard(papers.length - 1)}
                                                className={`w-2 h-2 rounded-full transition-all ${papers.length - 1 === currentCardIndex ? "bg-blue-600 w-4" : "bg-slate-300 hover:bg-slate-400"}`} />
                                        </> : papers.map((_, index) => <button
                                            key={index}
                                            onClick={() => scrollToCard(index)}
                                            className={`w-2 h-2 rounded-full transition-all ${index === currentCardIndex ? "bg-blue-600 w-4" : "bg-slate-300 hover:bg-slate-400"}`} />)}
                                    </div>
                                    {}
                                    <div className="text-sm text-slate-500">
                                        {currentCardIndex + 1}/ {papers.length}
                                    </div>
                                </div>
                                {}
                                <div className="flex items-center gap-2 pt-2 border-t">
                                    <span className="text-sm text-slate-500">快速跳转：</span>
                                    <div className="flex flex-wrap gap-1">
                                        {papers.slice(0, 10).map((paper, index) => <Button
                                            key={paper.id}
                                            variant={index === currentCardIndex ? "default" : "outline"}
                                            size="sm"
                                            className="h-7 w-7 p-0"
                                            onClick={() => scrollToCard(index)}>
                                            {index + 1}
                                        </Button>)}
                                        {papers.length > 10 && <span className="text-sm text-slate-400">...</span>}
                                    </div>
                                </div>
                            </div> : <div className="border rounded-lg overflow-hidden flex flex-col">
                                {}
                                <div
                                    ref={tableContentRef}
                                    className="flex-1 overflow-y-auto overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                                    style={{
                                        maxHeight: "370px"
                                    }}
                                    onScroll={() => {
                                        handleTableScroll();
                                    }}>
                                    <div
                                        ref={tableInnerRef}
                                        style={{
                                            minWidth: "1000px",
                                            width: "max-content"
                                        }}>
                                        <Table>
                                            <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
                                                <TableRow>
                                                    <TableHead className="w-12 sticky left-0 bg-slate-50 dark:bg-slate-900 z-20">选择</TableHead>
                                                    <TableHead className="min-w-[350px]">标题</TableHead>
                                                    <TableHead className="w-28">来源</TableHead>
                                                    <TableHead className="w-20">年份</TableHead>
                                                    <TableHead className="w-24">相关性</TableHead>
                                                    <TableHead className="w-24">PDF</TableHead>
                                                    <TableHead className="w-24">代码</TableHead>
                                                    <TableHead className="w-36">操作</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {papers.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(paper => {
                                                    const relevance = getRelevanceBadge(paper.relevanceScore);

                                                    return (
                                                        <TableRow key={paper.id} className={!paper.selected ? "opacity-50" : ""}>
                                                            <TableCell className="sticky left-0 bg-white dark:bg-slate-950 z-10">
                                                                <Checkbox
                                                                    checked={paper.selected}
                                                                    onCheckedChange={() => togglePaperSelection(paper.id)} />
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="space-y-1 py-1">
                                                                    <a
                                                                        href={paper.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="font-medium text-blue-600 hover:underline line-clamp-2 text-sm">
                                                                        {paper.title}
                                                                    </a>
                                                                    <p className="text-xs text-slate-500 line-clamp-1">{paper.snippet?.substring(0, 100)}...</p>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col gap-1">
                                                                    <Badge variant="outline" className="text-xs w-fit">
                                                                        {paper.source}
                                                                    </Badge>
                                                                    {paper.downloaded && <Badge className="bg-green-600 text-xs w-fit">
                                                                        <CheckCircle2 className="w-3 h-3 mr-1" />已下载
                                                                                                          </Badge>}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-sm text-slate-500">
                                                                {paper.year}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant={relevance.variant} className={relevance.className}>
                                                                    <Star className="w-3 h-3 mr-1" />
                                                                    {paper.relevanceScore}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                {paper.pdfUrl ? <Badge variant="outline" className="text-green-600 border-green-600">可下载
                                                                                                    </Badge> : <Badge variant="outline" className="text-orange-500 border-orange-500">需手动
                                                                                                    </Badge>}
                                                            </TableCell>
                                                            <TableCell>
                                                                {paper.codeUrl ? <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => window.open(paper.codeUrl, "_blank")}
                                                                    className="text-purple-600 hover:text-purple-700"
                                                                    title={paper.codeUrl}>
                                                                    <Github className="w-4 h-4 mr-1" />代码
                                                                                                    </Button> : <span className="text-xs text-slate-400">无</span>}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex gap-1">
                                                                    {paper.pdfUrl && <Button
                                                                        variant="default"
                                                                        size="sm"
                                                                        onClick={() => downloadSinglePaperDirect(paper)}
                                                                        disabled={paper.downloaded}
                                                                        className="bg-green-600 hover:bg-green-700">
                                                                        <Download className="w-4 h-4 mr-1" />下载
                                                                                                          </Button>}
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => window.open(paper.url, "_blank")}>
                                                                        <ExternalLink className="w-4 h-4 mr-1" />详情
                                                                                                        </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                                {}
                                <div
                                    ref={scrollbarRef}
                                    className="border-t bg-slate-50 dark:bg-slate-900 overflow-x-auto overflow-y-hidden"
                                    style={{
                                        height: "30px"
                                    }}
                                    onScroll={handleScrollbarScroll}>
                                    <div
                                        style={{
                                            width: `${tableScrollWidth}px`,
                                            height: "1px"
                                        }} />
                                </div>
                                
                                {/* 分页控件 */}
                                {papers.length > pageSize && (
                                    <div className="flex items-center justify-between px-4 py-2 border-t bg-slate-50 dark:bg-slate-900">
                                        <div className="text-sm text-slate-500">
                                            显示 {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, papers.length)} / 共 {papers.length} 条
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPage(1)}
                                                disabled={currentPage === 1}
                                            >
                                                首页
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                            >
                                                上一页
                                            </Button>
                                            <span className="text-sm text-slate-600 px-2">
                                                {currentPage} / {Math.ceil(papers.length / pageSize)}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPage(p => Math.min(Math.ceil(papers.length / pageSize), p + 1))}
                                                disabled={currentPage >= Math.ceil(papers.length / pageSize)}
                                            >
                                                下一页
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPage(Math.ceil(papers.length / pageSize))}
                                                disabled={currentPage >= Math.ceil(papers.length / pageSize)}
                                            >
                                                末页
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>}
                        </CardContent>
                    </Card>
                    {}
                    <Card className="lg:col-span-1">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <FileText className="w-5 h-5" />运行日志
                                              </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[400px]">
                                {logs.length === 0 ? <div className="text-center text-slate-500 py-8">暂无日志
                                                      </div> : <div className="font-mono text-xs space-y-1">
                                    {logs.map((log, index) => <div
                                        key={index}
                                        className={`flex gap-2 ${log.level === "error" ? "text-red-600" : log.level === "success" ? "text-green-600" : log.level === "warning" ? "text-yellow-600" : "text-slate-600"}`}>
                                        <span className="text-slate-400 shrink-0">[{log.time}]</span>
                                        <span className="break-all">
                                            {log.level === "error" && "❌ "}
                                            {log.level === "success" && "✅ "}
                                            {log.level === "warning" && "⚠️ "}
                                            {log.message}
                                        </span>
                                    </div>)}
                                </div>}
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}