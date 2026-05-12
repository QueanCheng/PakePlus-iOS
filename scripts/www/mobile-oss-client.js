/**
 * 移动端 OSS 客户端
 * 使用 AccessKey 直接认证进行文件上传下载
 */

class MobileOSSClient {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {string} config.region - OSS 区域
   * @param {string} config.bucket - Bucket 名称
   * @param {string} config.accessKeyId - AccessKey ID
   * @param {string} config.accessKeySecret - AccessKey Secret
   */
  constructor(config) {
    this.region = config.region;
    this.bucket = config.bucket;
    this.accessKeyId = config.accessKeyId;
    this.accessKeySecret = config.accessKeySecret;
    this.endpoint = `https://${config.bucket}.${config.region}.aliyuncs.com`;
  }

  /**
   * 计算 MD5（浏览器环境）
   * @param {ArrayBuffer} arrayBuffer - 文件内容的 ArrayBuffer
   * @returns {Promise<string>} Base64 编码的 MD5 值
   */
  async calculateMD5(arrayBuffer) {
    const hashBuffer = await crypto.subtle.digest('MD5', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return btoa(hashHex);
  }

  /**
   * 生成 OSS 签名
   * @param {string} method - HTTP 方法
   * @param {string} objectKey - OSS 对象名称
   * @param {string} contentType - 内容类型
   * @param {number} expiration - 过期时间戳
   * @returns {string} Base64 编码的签名
   */
  generateSignature(method, objectKey, contentType, expiration) {
    const canonicalizedOSSHeaders = '';
    const canonicalizedResource = `/${this.bucket}/${objectKey}`;
    const stringToSign = `${method}\n\n${contentType}\n${expiration}\n${canonicalizedOSSHeaders}${canonicalizedResource}`;
    
    // 使用 HMAC-SHA1 签名
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.accessKeySecret);
    const messageData = encoder.encode(stringToSign);
    
    return crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    ).then(key => crypto.subtle.sign('HMAC', key, messageData))
      .then(signature => btoa(String.fromCharCode(...new Uint8Array(signature))));
  }

  /**
   * 生成上传签名 URL
   * @param {string} objectKey - OSS 对象名称
   * @param {number} expiresIn - 过期时间（秒）
   * @param {string} contentType - 文件类型
   * @returns {Object} 签名 URL 信息
   */
  getUploadSignature(objectKey, expiresIn = 300, contentType = 'application/octet-stream') {
    const now = Math.floor(Date.now() / 1000);
    const expiration = now + expiresIn;
    const signature = this.generateSignature('PUT', objectKey, contentType, expiration);
    
    return {
      url: `${this.endpoint}/${objectKey}`,
      signedUrl: `${this.endpoint}/${objectKey}?OSSAccessKeyId=${this.accessKeyId}&Expires=${expiration}&Signature=${encodeURIComponent(signature)}`,
      expiration: expiration
    };
  }

  /**
   * 生成下载签名 URL
   * @param {string} objectKey - OSS 对象名称
   * @param {number} expiresIn - 过期时间（秒）
   * @returns {Object} 签名 URL 信息
   */
  getDownloadSignature(objectKey, expiresIn = 300) {
    const now = Math.floor(Date.now() / 1000);
    const expiration = now + expiresIn;
    const signature = this.generateSignature('GET', objectKey, '', expiration);
    
    return {
      url: `${this.endpoint}/${objectKey}`,
      signedUrl: `${this.endpoint}/${objectKey}?OSSAccessKeyId=${this.accessKeyId}&Expires=${expiration}&Signature=${encodeURIComponent(signature)}`,
      expiration: expiration
    };
  }

  /**
   * 上传文件到 OSS
   * @param {string} objectKey - OSS 对象名称
   * @param {Blob|File} file - 文件对象
   * @param {Object} options - 选项
   * @param {number} options.expiresIn - 签名 URL 过期时间（秒）
   * @param {string} options.contentType - 文件类型
   * @returns {Promise<Object>} 上传结果
   */
  async uploadFile(objectKey, file, options = {}) {
    const {
      expiresIn = 300,
      contentType = file.type || 'application/octet-stream'
    } = options;

    // 生成签名 URL
    const signature = this.getUploadSignature(objectKey, expiresIn, contentType);
    
    // 计算文件 MD5
    const arrayBuffer = await file.arrayBuffer();
    const md5 = await this.calculateMD5(arrayBuffer);

    // 上传文件
    const response = await fetch(signature.signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-MD5': md5
      },
      body: arrayBuffer
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`上传失败：${response.status} ${response.statusText}\n${errorText}`);
    }

    return {
      success: true,
      url: signature.url,
      objectKey: objectKey,
      expiration: signature.expiration
    };
  }

  /**
   * 从 OSS 下载文件
   * @param {string} objectKey - OSS 对象名称
   * @param {Object} options - 选项
   * @param {number} options.expiresIn - 签名 URL 过期时间（秒）
   * @returns {Promise<Blob>} 文件 Blob 对象
   */
  async downloadFile(objectKey, options = {}) {
    const { expiresIn = 300 } = options;

    // 生成签名 URL
    const signature = this.getDownloadSignature(objectKey, expiresIn);

    // 下载文件
    const response = await fetch(signature.signedUrl);

    if (!response.ok) {
      throw new Error(`下载失败：${response.status} ${response.statusText}`);
    }

    return await response.blob();
  }

  /**
   * 从 OSS 下载文件为 JSON 对象
   * @param {string} objectKey - OSS 对象名称
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 解析后的 JSON 对象
   */
  async downloadJSON(objectKey, options = {}) {
    const blob = await this.downloadFile(objectKey, options);
    const text = await blob.text();
    return JSON.parse(text);
  }


}

// 浏览器环境下的简化 MD5 计算（备用方案）
function calculateMD5Sync(data) {
  // 注意：这是一个简化版本，生产环境应该使用 crypto-js 等库
  // 这里仅作演示，实际应该引入 crypto-js 库
  console.warn('使用简化版 MD5 计算，建议引入 crypto-js 库');
  return '';
}

// 导出到全局作用域
window.MobileOSSClient = MobileOSSClient;
