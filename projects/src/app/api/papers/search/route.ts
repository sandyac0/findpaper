import { NextRequest } from 'next/server';
import { SearchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

interface SearchResult {
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
}

// 数据源配置
const DATA_SOURCES_CONFIG: Record<string, { name: string; domain: string; priority: number }> = {
  'arxiv': { name: 'arXiv', domain: 'arxiv.org', priority: 1 },
  'openalex': { name: 'OpenAlex', domain: 'openalex.org', priority: 2 },
  'scholar': { name: 'Google Scholar', domain: 'scholar.google.com', priority: 3 },
  'semantic': { name: 'Semantic Scholar', domain: 'semanticscholar.org', priority: 4 },
  'pubmed': { name: 'PubMed', domain: 'pubmed.ncbi.nlm.nih.gov', priority: 5 },
  'acm': { name: 'ACM DL', domain: 'dl.acm.org', priority: 6 },
  'ieee': { name: 'IEEE Xplore', domain: 'ieeexplore.ieee.org', priority: 7 },
  'springer': { name: 'Springer', domain: 'springer.com', priority: 8 },
  'elsevier': { name: 'ScienceDirect', domain: 'sciencedirect.com', priority: 9 },
};

function sendEvent(
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController,
  data: object
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

// 计算关键词相关性得分
function calculateRelevanceScore(title: string, snippet: string, keywords: string[]): number {
  const titleLower = title.toLowerCase();
  const snippetLower = snippet.toLowerCase();
  const fullText = titleLower + ' ' + snippetLower;
  
  let score = 0;
  const keywordList = keywords.map(k => k.toLowerCase().trim()).filter(Boolean);
  
  // 合并所有关键词为一个搜索短语
  const searchPhrase = keywordList.join(' ');
  
  for (const keyword of keywordList) {
    // === 标题匹配评分 ===
    
    // 1. 标题完全等于关键词 - 最高分（原始论文通常标题简洁）
    if (titleLower === keyword || titleLower === keyword + 's' || titleLower === keyword.replace(/s$/, '')) {
      score += 100;
    }
    
    // 2. 标题以关键词开头 - 很高分
    if (titleLower.startsWith(keyword)) {
      score += 50;
    }
    
    // 3. 标题中完全包含关键词
    if (titleLower.includes(keyword)) {
      score += 30;
      
      // 标题越短，关键词占比越高，相关性越强
      const titleWords = titleLower.split(/\s+/).length;
      const keywordWords = keyword.split(/\s+/).length;
      const coverageRatio = keywordWords / titleWords;
      
      // 关键词占标题比例高 - 加分
      if (coverageRatio > 0.5) {
        score += 20;
      } else if (coverageRatio > 0.3) {
        score += 10;
      }
      
      // 标题长度适中（不要太长）- 加分
      if (titleWords <= 10) {
        score += 10;
      }
    }
    
    // 4. 检查关键词的各个单词在标题中出现
    const words = keyword.split(/\s+/);
    let wordMatchCount = 0;
    for (const word of words) {
      if (word.length > 2 && titleLower.includes(word)) {
        wordMatchCount++;
        score += 5;
      }
    }
    
    // 所有单词都出现在标题中 - 加分
    if (wordMatchCount === words.length && words.length > 1) {
      score += 15;
    }
    
    // === 摘要匹配评分 ===
    const snippetMatches = (snippetLower.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    score += Math.min(snippetMatches * 2, 20); // 限制摘要匹配的最大加分
    
    // === 精确短语匹配加分 ===
    if (fullText.includes(keyword)) {
      score += 5;
    }
  }
  
  // === 额外加分项 ===
  
  // 检测是否是原始/开创性论文（标题中包含关键词且标题较短）
  const titleWords = titleLower.split(/\s+/).length;
  if (titleLower.includes(searchPhrase) && titleWords <= 8) {
    score += 25;
  }
  
  // 标题中包含 "A" "An" "The" 等开头的原始论文风格
  if (/^(a|an|the)\s+\w/i.test(title) && titleLower.includes(searchPhrase.split(' ')[0])) {
    score += 10;
  }
  
  return score;
}

// 提取代码链接（GitHub、GitLab、Bitbucket 等）
function extractCodeUrl(text: string): string | undefined {
  const codePatterns = [
    // GitHub
    /https?:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+/gi,
    // GitLab
    /https?:\/\/gitlab\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+/gi,
    // Bitbucket
    /https?:\/\/bitbucket\.org\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+/gi,
    // Papers with Code
    /https?:\/\/paperswithcode\.com\/[a-zA-Z0-9_/-]+/gi,
    // Hugging Face
    /https?:\/\/huggingface\.co\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+/gi,
  ];

  for (const pattern of codePatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      // 返回第一个匹配的代码链接
      let codeUrl = matches[0];
      // 清理 URL（移除尾部 punctuation）
      codeUrl = codeUrl.replace(/[.,;:!?)\]}>]+$/, '');
      return codeUrl;
    }
  }

  return undefined;
}

function extractYear(text: string): string {
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  return yearMatch ? yearMatch[0] : new Date().getFullYear().toString();
}

function extractAuthors(text: string): string {
  const patterns = [
    /(?:authors?|by)[:\s]+([^,\n]+(?:,\s*[^,\n]+){0,3})/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)/m,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const authors = match[1].trim().substring(0, 100);
      if (authors.length > 3 && !authors.includes('http')) {
        return authors;
      }
    }
  }
  return 'Unknown Authors';
}

// 生成 PDF URL - 支持多种来源
function generatePdfUrl(url: string, source: string): string | undefined {
  const urlLower = url.toLowerCase();
  const sourceLower = source.toLowerCase();
  
  // arXiv - 最常见
  if (sourceLower.includes('arxiv') || urlLower.includes('arxiv.org')) {
    const patterns = [
      /arxiv\.org\/abs\/([\d.]+)/i,
      /arxiv\.org\/pdf\/([\d.]+)/i,
      /arxiv\.org\/html\/([\d.]+)/i,
      /arxiv\.org\/(\d{4}\.\d+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return `https://arxiv.org/pdf/${match[1]}.pdf`;
      }
    }
  }
  
  // Semantic Scholar
  if (sourceLower.includes('semanticscholar') || urlLower.includes('semanticscholar.org')) {
    const match = url.match(/semanticscholar\.org\/paper\/([a-f0-9]+)/i);
    if (match) {
      return `https://www.semanticscholar.org/${match[1]}.pdf`;
    }
  }
  
  // PubMed / PMC
  if (sourceLower.includes('pubmed') || urlLower.includes('ncbi.nlm.nih.gov')) {
    const pmcMatch = url.match(/PMC(\d+)/i);
    if (pmcMatch) {
      return `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmcMatch[1]}/pdf/`;
    }
  }
  
  // 直接是 PDF 链接
  if (urlLower.includes('.pdf')) {
    return url;
  }
  
  // ACM Digital Library
  if (sourceLower.includes('acm.org') || urlLower.includes('dl.acm.org')) {
    const doiMatch = url.match(/10\.\d{4}\/[^\s]+/);
    if (doiMatch) {
      return `https://doi.org/${doiMatch[0]}`;
    }
  }
  
  // IEEE
  if (sourceLower.includes('ieee') || urlLower.includes('ieeexplore.ieee.org')) {
    const ieeeMatch = url.match(/article\/(\d+)/i);
    if (ieeeMatch) {
      return `https://ieeexplore.ieee.org/stamp/stamp.jsp?arnumber=${ieeeMatch[1]}`;
    }
  }
  
  // Springer
  if (sourceLower.includes('springer') || urlLower.includes('link.springer.com')) {
    if (urlLower.includes('.pdf')) {
      return url;
    }
    const doiMatch = url.match(/10\.\d{4}\/[^\s]+/);
    if (doiMatch) {
      return `https://link.springer.com/content/pdf/${doiMatch[0]}.pdf`;
    }
  }
  
  return undefined;
}

// 检查是否是有效的学术来源
function isAcademicSource(url: string, siteName: string): boolean {
  const academicDomains = [
    'arxiv.org',
    'openalex.org',
    'scholar.google',
    'semanticscholar.org',
    'pubmed.ncbi.nlm.nih.gov',
    'dl.acm.org',
    'ieeexplore.ieee.org',
    'springer.com',
    'link.springer.com',
    'sciencedirect.com',
    'researchgate.net',
    'nature.com',
    'science.org',
    'wiley.com',
    'mdpi.com',
    'frontiersin.org',
    'plos.org',
    'jstor.org',
    'acm.org',
    '.edu',
    'core.ac.uk',
    'dblp.org',
  ];
  
  const urlLower = url.toLowerCase();
  const siteLower = siteName.toLowerCase();
  
  return academicDomains.some(domain => urlLower.includes(domain) || siteLower.includes(domain));
}

interface SourceResult {
  title: string;
  url: string;
  snippet: string;
  siteName: string;
  publishTime?: string;
  pdfUrl?: string;
  codeUrl?: string;
  authors?: string;
}

// OpenAlex API 响应类型
interface OpenAlexWork {
  id: string;
  title: string;
  display_name: string;
  authorships: Array<{
    author: { display_name: string };
  }>;
  publication_year: number;
  primary_location?: {
    source?: {
      display_name: string;
    };
    landing_page_url?: string;
    pdf_url?: string;
  };
  open_access?: {
    oa_url?: string;
  };
  abstract_inverted_index?: Record<string, number[]>;
  cited_by_count: number;
}

// OpenAlex 直接 API 搜索
async function searchOpenAlex(
  query: string,
  startYear: number,
  endYear: number,
  count: number,
  userApiKey?: string
): Promise<SourceResult[]> {
  try {
    // 优先使用用户提供的 API Key，否则使用环境变量
    const apiKey = userApiKey || process.env.OPENALEX_API_KEY || '';
    
    // 构建过滤条件
    const filters = [];
    if (startYear && endYear) {
      filters.push(`publication_year:${startYear}-${endYear}`);
    } else if (startYear) {
      filters.push(`publication_year:>=${startYear}`);
    } else if (endYear) {
      filters.push(`publication_year:<=${endYear}`);
    }

    // 构建请求参数
    // 搜索结果默认按 relevance_score 排序（基于文本相似度和引用数）
    const params = new URLSearchParams({
      search: query,
      per_page: String(Math.min(count, 200)),
      // 不指定 sort，使用默认的相关性排序
    });

    if (filters.length > 0) {
      params.append('filter', filters.join(','));
    }

    // 如果有 API Key，添加到参数
    if (apiKey) {
      params.append('api_key', apiKey);
    }

    // 构建请求头
    const headers: Record<string, string> = {
      'User-Agent': 'PaperSearch/1.0 (https://github.com/paper-search)',
    };
    
    // 如果没有 API Key，使用 mailto 参数获得更高的请求限制
    if (!apiKey) {
      headers['User-Agent'] = 'PaperSearch/1.0 (mailto:research@example.com)';
    }

    const response = await fetch(`https://api.openalex.org/works?${params.toString()}`, {
      headers,
    });

    if (!response.ok) {
      console.error('OpenAlex API error:', response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    const works: OpenAlexWork[] = data.results || [];

    return works.map((work) => {
      // 从 inverted index 重建摘要
      let abstract = '';
      if (work.abstract_inverted_index) {
        const positions: Array<[string, number]> = [];
        for (const [word, positions_arr] of Object.entries(work.abstract_inverted_index)) {
          for (const pos of positions_arr) {
            positions.push([word, pos]);
          }
        }
        positions.sort((a, b) => a[1] - b[1]);
        abstract = positions.map((p) => p[0]).join(' ');
      }

      // 获取 PDF URL
      const pdfUrl = work.open_access?.oa_url || work.primary_location?.pdf_url || '';
      const landingUrl = work.primary_location?.landing_page_url || work.id;

      return {
        title: work.display_name || work.title || '',
        url: landingUrl,
        snippet: abstract || `Cited by ${work.cited_by_count} works`,
        siteName: 'OpenAlex',
        publishTime: work.publication_year?.toString(),
        pdfUrl,
        authors: work.authorships?.slice(0, 3).map((a) => a.author.display_name).join(', ') || '',
      };
    });
  } catch (error) {
    console.error('OpenAlex search error:', error);
    return [];
  }
}

// 搜索单个数据源
async function searchSource(
  searchClient: SearchClient,
  query: string,
  sourceDomain: string,
  count: number
): Promise<SourceResult[]> {
  try {
    const response = await searchClient.advancedSearch(query, {
      count,
      sites: sourceDomain,
      needContent: false,
      needSummary: false,
    });
    
    return (response.web_items || []).map(item => ({
      title: item.title || '',
      url: item.url || '',
      snippet: item.snippet || '',
      siteName: item.site_name || sourceDomain,
      publishTime: item.publish_time,
    }));
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const { 
    keywords, 
    startYear, 
    endYear, 
    maxResults, 
    maxPerSource, 
    sources: selectedSources,
    openalexApiKey: userApiKey,
  } = await request.json();

  if (!keywords || keywords.trim() === '') {
    return new Response(JSON.stringify({ error: '关键词不能为空' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 获取用户选择的数据源，默认使用全部
  const enabledSourceIds = selectedSources && selectedSources.length > 0 
    ? selectedSources 
    : Object.keys(DATA_SOURCES_CONFIG);

  if (enabledSourceIds.length === 0) {
    return new Response(JSON.stringify({ error: '请至少选择一个数据源' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
        const config = new Config();
        const searchClient = new SearchClient(config, customHeaders);

        // 解析关键词
        const keywordList = keywords.split(',').map((k: string) => k.trim()).filter(Boolean);
        const searchQuery = keywordList.join(' ');
        
        sendEvent(encoder, controller, { type: 'log', level: 'info', message: `正在搜索: ${searchQuery}` });

        let allResults: SearchResult[] = [];
        let id = 1;
        const seenUrls = new Set<string>();

        // 定义数据源接口
        interface SourceConfig {
          id: string;
          name: string;
          domain: string;
          priority: number;
        }

        // 根据用户选择构建数据源列表
        const sources: SourceConfig[] = enabledSourceIds
          .map((sourceId: string) => {
            const config = DATA_SOURCES_CONFIG[sourceId];
            return config ? { id: sourceId, ...config } : null;
          })
          .filter((s: SourceConfig | null): s is SourceConfig => s !== null)
          .sort((a: SourceConfig, b: SourceConfig) => a.priority - b.priority);

        const sourceNames = sources.map((s: SourceConfig) => s.name).join(', ');
        sendEvent(encoder, controller, { type: 'log', level: 'info', message: `已选数据源: ${sourceNames}` });

        // 计算每个源的搜索数量
        const countPerSource = Math.max(Math.floor(maxPerSource / sources.length), 10);

        // 检查是否选择了 OpenAlex
        const hasOpenAlex = sources.some((s: SourceConfig) => s.id === 'openalex');
        const otherSources = sources.filter((s: SourceConfig) => s.id !== 'openalex');

        // 阶段1: OpenAlex 直接 API 搜索（如果选择了）
        if (hasOpenAlex) {
          sendEvent(encoder, controller, { type: 'log', level: 'info', message: '正在通过 OpenAlex API 搜索...' });
          
          const openAlexResults = await searchOpenAlex(searchQuery, startYear, endYear, countPerSource, userApiKey);
          sendEvent(encoder, controller, { type: 'log', level: 'info', message: `OpenAlex 找到 ${openAlexResults.length} 条结果` });
          
          for (const item of openAlexResults) {
            if (seenUrls.has(item.url)) continue;
            seenUrls.add(item.url);

            const year = item.publishTime || extractYear(item.snippet);
            const yearNum = parseInt(year);
            
            if (yearNum && (yearNum < startYear || yearNum > endYear)) continue;

            const relevanceScore = calculateRelevanceScore(item.title, item.snippet, keywordList);
            if (relevanceScore < 5) continue;

            allResults.push({
              id: id++,
              title: item.title || 'Untitled',
              authors: item.authors || extractAuthors(item.snippet || ''),
              year,
              source: 'OpenAlex',
              url: item.url,
              pdfUrl: item.pdfUrl || generatePdfUrl(item.url, 'OpenAlex'),
              codeUrl: item.codeUrl || extractCodeUrl(item.snippet || ''),
              snippet: item.snippet || '',
              relevanceScore: relevanceScore + 15, // OpenAlex API 结果加分
            });
          }
        }

        // 阶段2: 精确搜索其他数据源
        if (otherSources.length > 0) {
          sendEvent(encoder, controller, { type: 'log', level: 'info', message: '正在搜索其他数据源...' });
          
          const exactSearchPromises = otherSources.map((source: SourceConfig) => 
            searchSource(searchClient, searchQuery, source.domain, Math.floor(countPerSource / 2))
              .then(results => ({ source, results }))
          );

          const exactResults = await Promise.all(exactSearchPromises);

          for (const { source, results } of exactResults) {
            for (const item of results) {
              if (seenUrls.has(item.url)) continue;
              seenUrls.add(item.url);

              const year = extractYear(item.publishTime || item.snippet || '');
              const yearNum = parseInt(year);
              
              if (yearNum && (yearNum < startYear || yearNum > endYear)) continue;

              const relevanceScore = calculateRelevanceScore(item.title, item.snippet, keywordList);
              if (relevanceScore < 10) continue;

              allResults.push({
                id: id++,
                title: item.title || 'Untitled',
                authors: extractAuthors(item.snippet || ''),
                year,
                source: item.siteName,
                url: item.url,
                pdfUrl: generatePdfUrl(item.url, item.siteName),
                codeUrl: extractCodeUrl(item.snippet || ''),
                snippet: item.snippet || '',
                relevanceScore: relevanceScore + 20,
              });
            }
          }
        }

        // 阶段3: 扩展搜索
        if (allResults.length < maxResults && otherSources.length > 0) {
          sendEvent(encoder, controller, { type: 'log', level: 'info', message: '正在扩展搜索相关论文...' });
          
          const expandedSearchPromises = otherSources.map((source: SourceConfig) => 
            searchSource(searchClient, `${searchQuery} paper research`, source.domain, countPerSource)
              .then(results => ({ source, results }))
          );

          const expandedResults = await Promise.all(expandedSearchPromises);

          for (const { source, results } of expandedResults) {
            if (results.length > 0) {
              sendEvent(encoder, controller, { type: 'log', level: 'info', message: `${source.name} 找到 ${results.length} 条结果` });
            }

            for (const item of results) {
              if (allResults.length >= maxResults * 3) break;
              if (seenUrls.has(item.url)) continue;
              seenUrls.add(item.url);

              const year = extractYear(item.publishTime || item.snippet || '');
              const yearNum = parseInt(year);
              
              if (yearNum && (yearNum < startYear || yearNum > endYear)) continue;

              const relevanceScore = calculateRelevanceScore(item.title, item.snippet, keywordList);
              if (relevanceScore < 5) continue;

              allResults.push({
                id: id++,
                title: item.title || 'Untitled',
                authors: extractAuthors(item.snippet || ''),
                year,
                source: item.siteName,
                url: item.url,
                pdfUrl: generatePdfUrl(item.url, item.siteName),
                codeUrl: extractCodeUrl(item.snippet || ''),
                snippet: item.snippet || '',
                relevanceScore,
              });
            }
          }
        }

        // 如果结果不够，进行通用搜索
        if (allResults.length < maxResults) {
          sendEvent(encoder, controller, { type: 'log', level: 'info', message: '正在扩展搜索范围...' });
          
          const generalResponse = await searchClient.webSearch(`${searchQuery} academic paper pdf`, maxPerSource, false);
          
          if (generalResponse.web_items) {
            for (const item of generalResponse.web_items) {
              if (allResults.length >= maxResults * 2) break;
              if (seenUrls.has(item.url || '')) continue;
              seenUrls.add(item.url || '');

              const url = item.url || '';
              const siteName = item.site_name || '';
              
              if (!isAcademicSource(url, siteName)) continue;

              const year = extractYear(item.publish_time || item.snippet || '');
              const yearNum = parseInt(year);
              
              if (yearNum && (yearNum < startYear || yearNum > endYear)) continue;

              const relevanceScore = calculateRelevanceScore(item.title || '', item.snippet || '', keywordList);
              if (relevanceScore < 3) continue;

              allResults.push({
                id: id++,
                title: item.title || 'Untitled',
                authors: extractAuthors(item.snippet || ''),
                year,
                source: siteName || new URL(url).hostname,
                url,
                pdfUrl: generatePdfUrl(url, siteName),
                codeUrl: extractCodeUrl(item.snippet || ''),
                snippet: item.snippet || '',
                relevanceScore,
              });
            }
          }
        }

        // 按相关性得分排序
        allResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
        
        // 截取到最大结果数
        allResults = allResults.slice(0, maxResults);
        
        // 重新分配 ID
        allResults = allResults.map((paper, index) => ({ ...paper, id: index + 1 }));

        if (allResults.length === 0) {
          sendEvent(encoder, controller, { type: 'log', level: 'warning', message: '未找到符合条件的相关论文' });
          sendEvent(encoder, controller, { type: 'log', level: 'info', message: '建议：尝试调整关键词、扩大年份范围或选择更多数据源' });
        } else {
          sendEvent(encoder, controller, { type: 'log', level: 'success', message: `搜索完成，共找到 ${allResults.length} 篇论文（已按相关性排序）` });
        }

        // 流式发送结果
        for (const paper of allResults) {
          sendEvent(encoder, controller, { type: 'paper', data: paper });
          await new Promise(resolve => setTimeout(resolve, 30));
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        sendEvent(encoder, controller, {
          type: 'log',
          level: 'error',
          message: `搜索失败: ${error instanceof Error ? error.message : '未知错误'}`,
        });
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
