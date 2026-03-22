import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';

interface Paper {
  id: number;
  title: string;
  authors: string;
  year: string;
  source: string;
  url: string;
  pdfUrl?: string;
  snippet: string;
}

// 直接下载 PDF（返回文件内容）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  
  if (!url) {
    return NextResponse.json({ error: '缺少下载链接' }, { status: 400 });
  }

  try {
    // 直接获取 PDF 内容
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*',
      },
    });

    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'application/pdf';
    const buffer = Buffer.from(await response.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="paper_${Date.now()}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Direct download error:', error);
    return NextResponse.json({ 
      error: '下载失败，请尝试手动下载',
      fallbackUrl: url 
    }, { status: 500 });
  }
}

// 下载并存储到对象存储
export async function POST(request: NextRequest) {
  try {
    const { paper, overwrite, directDownload } = await request.json() as { 
      paper: Paper; 
      overwrite: boolean;
      directDownload?: boolean;
    };

    if (!paper.pdfUrl) {
      return NextResponse.json({
        success: false,
        error: '该论文没有可用的 PDF 链接',
        fallbackUrl: paper.url, // 返回原页面链接让用户手动下载
      });
    }

    // 如果选择直接下载模式，尝试直接获取 PDF
    if (directDownload) {
      try {
        const response = await fetch(paper.pdfUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/pdf,*/*',
          },
        });

        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          
          // 存储到对象存储
          const storage = new S3Storage({
            endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
            accessKey: '',
            secretKey: '',
            bucketName: process.env.COZE_BUCKET_NAME,
            region: 'cn-beijing',
          });

          const safeTitle = paper.title
            .substring(0, 50)
            .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
          const fileName = `papers/${safeTitle}_${paper.id}.pdf`;

          const uploadedKey = await storage.uploadFile({
            fileContent: buffer,
            fileName,
            contentType: 'application/pdf',
          });

          const downloadUrl = await storage.generatePresignedUrl({
            key: uploadedKey,
            expireTime: 86400,
          });

          return NextResponse.json({
            success: true,
            message: '下载成功',
            key: uploadedKey,
            downloadUrl,
            fileSize: buffer.length,
          });
        }
      } catch (fetchError) {
        console.error('Direct fetch failed:', fetchError);
        // 继续尝试其他方式
      }
    }

    // 尝试通过对象存储的 uploadFromUrl
    try {
      const storage = new S3Storage({
        endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
        accessKey: '',
        secretKey: '',
        bucketName: process.env.COZE_BUCKET_NAME,
        region: 'cn-beijing',
      });

      const safeTitle = paper.title
        .substring(0, 50)
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const fileName = `papers/${safeTitle}_${paper.id}.pdf`;

      // 检查是否已存在
      if (!overwrite) {
        const exists = await storage.fileExists({ fileKey: fileName });
        if (exists) {
          const downloadUrl = await storage.generatePresignedUrl({
            key: fileName,
            expireTime: 86400,
          });
          return NextResponse.json({
            success: true,
            message: '文件已存在',
            key: fileName,
            downloadUrl,
          });
        }
      }

      // 尝试从 URL 上传
      const uploadedKey = await storage.uploadFromUrl({
        url: paper.pdfUrl,
        timeout: 60000,
      });

      const downloadUrl = await storage.generatePresignedUrl({
        key: uploadedKey,
        expireTime: 86400,
      });

      return NextResponse.json({
        success: true,
        message: '下载成功',
        key: uploadedKey,
        downloadUrl,
      });
    } catch (storageError) {
      console.error('Storage upload failed:', storageError);
      
      // 返回原始 PDF URL 让用户手动下载
      return NextResponse.json({
        success: false,
        error: '自动下载失败，请点击链接手动下载',
        fallbackUrl: paper.pdfUrl,
        paperUrl: paper.url,
      });
    }
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '下载失败',
    });
  }
}
