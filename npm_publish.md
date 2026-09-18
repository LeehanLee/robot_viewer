## 3. 登录 npm

```
npm login
```

依次输入：

1. npm 用户名
2. npm 密码
3. 邮箱
4. 邮箱收到的一次性验证码（OTP）

验证是否登录成功：

```
npm whoami
# 输出你的用户名，代表登录成功
```

> 
> ⚠️ 注意：如果你配置过淘宝镜像，发布包**必须切回官方源**！

```
# 查看当前源
npm config get registry

# 切换为npm官方源（发布必须用这个）
npm config set registry https://registry.npmjs.org/

# 后续想切回淘宝源
# npm config set registry https://registry.npmmirror.com
```

## 4. 本地预检查（非常推荐）

### ① 打包预览，看即将上传哪些文件

```
npm pack
```

执行后会生成一个 `.tgz` 压缩包，打开看看里面的文件是不是你想要发布的，避免把敏感文件、node_modules 传上去。

### ② 本地测试安装（可选）

在别的目录测试本地包：

```
# 在别的项目目录执行，路径写你tgz包的绝对路径
npm install /xxx/your-package-demo-1.0.0.tgz
```

## 5. 发布包

```
npm publish
```

> 
> 如果是**私有域包**（@xxx/yyy），发布命令：

```
npm publish --access public
```

私有域默认是私有包，免费账号不能发布私有包，必须加 `--access public`。

发布成功后，就可以在任意项目安装：

```
npm install your-package-demo
```

## 6. 更新包版本（后续迭代）

npm 版本规则：`主版本.次版本.补丁版本`

- 补丁修复：`1.0.0` → `1.0.1`

```
npm version patch
```

- 新增功能，兼容旧代码：`1.0.0` → `1.1.0`

```
npm version minor
```

- 破坏性更新：`1.0.0` → `2.0.0`

```
npm version major
```

执行完会自动修改 `package.json` 的 version，**再执行一次 npm publish** 即可发布新版本。