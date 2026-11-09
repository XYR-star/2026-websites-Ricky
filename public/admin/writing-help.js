// Keep help outside Decap's React root. It never changes or saves an entry.
export function mountWritingHelp() {
  if (document.getElementById("writing-help")) return;
  const container = document.createElement("aside");
  container.id = "writing-help";
  container.setAttribute("aria-label", "写作帮助");
  container.innerHTML = `
    <button class="writing-help__open" type="button" aria-haspopup="dialog">写作帮助</button>
    <dialog class="writing-help__dialog" aria-labelledby="writing-help-title">
      <header class="writing-help__header">
        <div>
          <p class="writing-help__eyebrow">随时继续写</p>
          <h2 id="writing-help-title">保存、预览与发布</h2>
        </div>
        <button class="writing-help__close" type="button" aria-label="关闭写作帮助">关闭</button>
      </header>
      <div class="writing-help__content">
        <ol class="writing-help__steps">
          <li><strong>保存到云端</strong><span>点「保存」，等待编辑器显示「修改已保存」。未发布的文章从「工作流」继续。上传图片后，也要保存文章。</span></li>
          <li><strong>检查预览</strong><span>右侧预览用于边写边看；构建预览用于核对实际网页。预览成功后，文章仍需发布。</span></li>
          <li><strong>发布并等待上线</strong><span>发布后到 Deploys（部署）查看正式分支 main 的 production 部署。成功后打开正式文章核对；草稿分支的预览与正式站分别显示。</span></li>
        </ol>
        <section class="writing-help__note">
          <h3>编辑页面与切换外观</h3>
          <p>博客、游记、研究日志按篇管理。首页、轨迹、关于、近况、项目和站点文案在「页面与站点」中编辑，也先保存草稿再发布。首页区块可拖动排序或暂时关闭。左下角「外观」可切换浅色、深色或跟随系统。</p>
        </section>
        <section class="writing-help__note">
          <h3>换手机、换电脑前</h3>
          <p>先保存并确认成功，再到另一台设备打开。两台设备编辑同一篇文章时，先保存一台，再重新打开另一台，避免使用旧内容继续修改。</p>
        </section>
        <section class="writing-help__note">
          <h3>刷新后找回未保存输入</h3>
          <p>编辑器会尝试在当前浏览器保留本机备份。重新打开同一篇文章时，如出现恢复提示，请核对后选择恢复。本机备份仅限同一浏览器、同一网址；恢复后仍需点保存才能跨设备继续。</p>
        </section>
        <section class="writing-help__note">
          <h3>图片与文章一起管理</h3>
          <p>图片按原文件保存到 R2，素材归档编号会自动生成。新文章请优先使用「新建」；「复制」会沿用原文章的素材目录。删除素材前先检查文章引用。</p>
        </section>
        <p class="writing-help__privacy">当前文章仓库与素材域名公开，草稿和已上传图片也按公开资料处理。</p>
      </div>
    </dialog>`;
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/admin/writing-help.css";
  document.head.append(stylesheet);
  document.body.append(container);
  const dialog = container.querySelector("dialog");
  const open = container.querySelector(".writing-help__open");
  const close = container.querySelector(".writing-help__close");
  open.addEventListener("click", () => dialog.showModal());
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => open.focus());
}
