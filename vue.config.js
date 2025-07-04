const { defineConfig } = require('@vue/cli-service');
module.exports = defineConfig({
    publicPath: process.env.NODE_ENV === 'production'
        ? '/webrtc_demo/'
        : '/',
    transpileDependencies: true,
    devServer: {
        proxy: {
            '/hls': {
                target: 'https://live.prd.dlive.tv',
                changeOrigin: true,
                pathRewrite: { '^/hls': '/hls' },
                ws: false,
                onProxyReq: (proxyReq, req, res) => {
                    // 打印实际代理的目标地址
                    console.log('Proxying:', req.url, '->', proxyReq.getHeader('host') + proxyReq.path);
                }
            }
        }
    }
});