const {defineConfig} = require('@vue/cli-service')
module.exports = defineConfig({
    publicPath: process.env.NODE_ENV === 'production'
        ? '/webrtc_demo/'  // 匹配GitHub仓库名称
        : '/',
    transpileDependencies: true
})
