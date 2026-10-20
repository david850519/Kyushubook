# 九州小書

兩人使用的旅行小書。公開介面仍以熊本示意內容呈現；完整八天私人內容與原始 PDF 只透過本機製包、手機匯入，不放進網站。第二階段已加入個人記帳、換算、加密備份與復原、本機製包及清除確認；iPhone 正式 HTTPS 安裝與實機驗收仍未執行。

## 已實作

- 行程總覽、每日詳情、地點搜尋與純圖示地圖按鈕；已移除可見的「開啟地圖」文字與所有複製功能，保留無障礙名稱與提示。
- 旅務頁、示意票券、App 內 PDF 閱讀與縮放、照片放大。
- 個人行前清單、未完成篩選與 IndexedDB 保存；伴手禮清單已依最新需求移除，舊包的採買項目不顯示。
- 使用原稿手寫標題、自駕、行李箱與草葉插圖的手機／桌面排版，插圖亦列入離線快取。
- 景點可指定 `mapUrl`，熊本城使用使用者提供的短連結，其他示範景點使用官網地圖的固定地點 CID；無指定網址的舊包仍保留地址搜尋作相容處理。
- 舊示範旅程自動升版並保留行前勾選；自行匯入的非示範旅程不自動替換。
- 同一選檔入口支援一次或分次匯入設定檔與旅遊包。設定檔先在記憶體待命，只有旅遊包成功解密且驗證後才更新已保存的旅程。
- Web Crypto AES-256-GCM 認證加密，金鑰不隨應用公開部署。本機以不可匯出的 CryptoKey 持續讀取；這不是硬體保險箱或免受惡意程式讀取的保證。
- 格式、檔案大小、附件簽章與版本檢查；壞包、錯誤金鑰或舊版本不覆蓋有效資料；相同旅程更新保留勾選。
- 應用、中文字型、示範照片、PDF 閱讀器與標準字型均可本機快取，不使用外部字型／圖片 CDN 或線上 PDF 檢視器。

- 個人花費：新增、編輯、確認刪除、分類篩選、日期、備註、日圓／新臺幣分開合計與參考合計；以最小貨幣單位保存，不直接累加浮點小數。
- 手動參考匯率及雙向換算；不抓即時報價、不做多人分帳，離線可用。
- 私密設定新增獨立備份金鑰；擁有者在本機輸入密語，以 PBKDF2-SHA256 衍生備份金鑰，原密語不寫入設定、部署或紀錄。旅伴匯入後免再輸入密語。
- 加密備份／復原：匯出個人勾選、支出與匯率；先預覽日期與筆數，確認後才覆蓋，不自動合併，旅遊內容保持不變。壞檔與不相符金鑰不覆蓋有效資料。
- 清除本機資料需明確確認，之後回到示範旅程；原檔與手動備份仍須自行保管。
- 僅 localhost 可操作的圖形化製包頁，接受行程 JSON、PDF／圖片及既有設定。製包時不傳送檔案，支援沿用既有金鑰更新內容與保持備份相容。

## 本機啟動

使用 Node.js 24；私有內容工具使用其內建 TypeScript 支援。在此資料夾執行：

```powershell
npm install
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

開啟 http://127.0.0.1:4173/ 。一般開發可用 `npm run dev`，但離線驗證必須用正式 build 與 preview。第一次自動載入明確標示的示範旅程，不含任何真實訂位資料。

此 localhost 網址是本機桌面預覽，不是可供 iPhone 安裝的正式站點。iPhone 主畫面安裝與持久化須在正式 HTTPS 來源上用實機驗收；尚未部署、上傳資料或宣稱兩款指定 iPhone 已通過驗收。

## GitHub Pages 部署

Git 儲存庫只建立在本 `app` 資料夾，不能建立在含原 PDF 與素材的上一層。已提供 `.github/workflows/pages.yml`，以 Node.js 24 安裝、lint、單元測試、建置、檢查產物後，只發布 `dist`。GitHub Pages 的專案子路徑由 `configure-pages` 的 `base_path` 自動帶入，不必把 repository 名稱硬編碼進程式。

1. 在 GitHub 建立空白 repository，例如 `kyushu-travel-book`；GitHub Free 通常使用 public repository 才能免費啟用 Pages。不要預先新增 README、license 或 gitignore，以免首次 push 需要合併。
2. 在本機 PowerShell 執行下列第一段，先確認暫存清單沒有 `private/`、原 PDF、`.kykey`、`.kyushu` 或 `.kybackup`。不要使用 `git add -f` 追蹤被忽略的檔案。

```powershell
Set-Location 'D:\Decrypt\gitproject\personal\旅遊小書\app'
git init
git add .
git status --short
```

3. 將 `YOUR_NAME` 換成你的 GitHub 帳號；repository 名稱若不同也要替換。確認後執行：

```powershell
git commit -m "Set up travel book"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/kyushu-travel-book.git
git push -u origin main
```

4. GitHub repository → Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。若能在首次 push 前設定可先設定；如果初次工作流程因尚未啟用 Pages 失敗，設定完成後到 Actions → Deploy Travel Book to GitHub Pages → Run workflow，再執行 main。
5. 工作流程成功後，網址通常為 `https://YOUR_NAME.github.io/kyushu-travel-book/`，實際網址以 Pages／Actions 顯示為準。iPhone 以 Safari 開啟、加入主畫面，再從主畫面 App 匯入私密設定與旅遊包。

之後修改程式，只需 `git add .`、`git commit`、`git push`，main 的 push 會觸發部署。Git 登入或權限提示需由你在自己的登入視窗完成，不要把權杖或密語貼到聊天。

網站預設的一天示範不是完整私人資料遺失：公開網站不內含八天私人行程。完整資料由本機製包，兩份檔案私下交付，不能 commit、上傳 GitHub 或放進 Pages。製包工具仍只在本機開啟，不在 GitHub Pages 操作。

Pages 網址請保持固定；更換網域會形成不同的本機儲存來源，需要重新匯入原設定、旅遊包及個人備份。同一個 `YOUR_NAME.github.io` 網域下的其他專案屬同源，不能把不同 repository 路徑視為安全隔離；勿在同網域部署不信任的程式。

已在本機用 `/pages-smoke/` 驗證 manifest、圖示、Service Worker scope、啟動與離線 PDF；實際 GitHub 工作流程仍需你 push 並授權 Pages 後才能驗證。

## 製作正式私人旅遊包

1. 開啟 http://127.0.0.1:4173/#prepare 。此頁僅在 localhost 可用，不會在公開站點顯示製包工具。
2. 「行程資料 JSON」選擇本機 `private/ready-trip.json`，已包含八天結構化內容與完整 36 頁原 PDF，不必再次附加原稿。額外票券可由附件欄選入。
3. 第一次由擁有者在本機設定共用備份密語（12～256 字元）並確認；不要貼到聊天、原始碼或環境變數。按「產生加密旅遊包」，分別下載私密設定與旅遊包。
4. 內容更新時選取原有私密設定，不重新產生一套金鑰；新行程的 revision 必須大於等於已匯入版號。兩支手機各自匯入，金鑰不變時既有備份仍可用。
5. 兩支手機先加入主畫面，再從主畫面 App 匯入兩檔。之後不需密語，個人勾選與記帳仍各自保存在手機，沒有自動同步。

設定檔等同鑰匙，請和旅遊包及備份分開保管、分開傳遞。共用設定意味持有者可解開對方使用同組設定的備份；免解鎖不是本機保險箱。

`private/source-trip.json` 是從原稿整理的文字與旅務資料；`private/ready-trip.json` 是已含原 PDF 的製包來源。兩者都是未加密的本機私有工作檔，不可部署、上傳或放進 public。Vite 開發伺服器亦拒絕讀取 private、金鑰、旅遊包、備份及原 PDF。

原稿共整理為八天、84 筆日期索引行程、44 項準備、14 份旅務摘要；84 筆不代表 84 個不同景點。兩筆住宿日期、福岡兩日分日、休館／管制等原稿疑義已保留註記，細節見 `private/extraction-notes.md`。缺少地址或英文名稱未擅自編造；票券離線顯示也不等於供應商允許離線核驗。

重新整理來源：`npm run private:prepare`。完整私人流程驗證：`npm run private:verify`，僅使用隨機臨時測試設定，不使用正式密語；原稿內容不輸出、不截圖、不留 trace，測試環境結束後清除。這兩個工具不適用沒有本機原稿的公開下載者。

## 測試匯入

1. 右上角設定，分別下載示範設定與示範旅遊包。兩者須在同一次頁面工作階段下載，示範金鑰會隨工作階段重新產生。
2. 同一入口選取兩檔，或先設定檔、再旅遊包；不需輸入密語。
3. 勾選清單並重新載入，檢查狀態仍在。等「離線已備妥」後切斷網路，重新載入並開啟示範 PDF。

示範設定是一次性的公開示意資料，不用於真實旅行。正式私密設定等同鑰匙，須與旅遊包及備份分開保管，不放在 `public`、`src`、網站、聊天或公開原始碼；`.gitignore` 不能取代正確的資料隔離與部署檢查。

## 驗證

```powershell
npm test
npm run lint
npm run test:e2e
```

端到端測試先建置；另開終端維持上述 preview。測試使用本機 Microsoft Edge，包含 393px 手機與 1440px 桌面，另檢查 320px 窄螢幕。截圖在 `test-results`，失敗時保留 trace；測試只使用虛構資料。

- 單元測試 13 項：原有加密、保存、地圖、日本日期，以及金額精度、花費 CRUD、更新保留、備份預覽／復原、錯誤備份保護、舊設定相容。
- 瀏覽器測試 18 項：原有行程、清單、匯入、離線與截圖，加上記帳換算、加密備份完整流程、清除確認與製包回匯，手機／桌面各跑一遍。
- 這些是 Chromium／Edge 驗證，不是 iOS Safari、真實票券有效性或正式安全稽核。

本輪最終結果：建置、無警告品質檢查、13 項單元測試與 18 項手機／桌面瀏覽器測試全部通過；完整私人資料與 36 頁原 PDF 的本機製包、匯入、離線閱讀及部署隔離驗證亦通過。中途曾有瀏覽器截圖長時間逾時，重新以新工作階段驗證後，最終整輪 18 項於 4.8 分鐘內全部通過。開發伺服器對實際私有來源檔回傳 HTTP 403；測試用開發伺服器已關閉，正式產物預覽保持運作。

## 資源與授權

- 原稿插圖由使用者提供於本案使用，網頁版只縮小，不修改原始檔；來源對照見 `public/illustrations/README.md`。此紀錄不另行授予第三方再散佈權利。
- 城彩苑固定地點 CID 取自 [官方交通頁](https://1592.jp/shisetsu/access) 的 Google Maps iframe；水前寺固定地點 CID 取自 [官方交通頁](https://www.suizenji.or.jp/access/) 的 Google Maps iframe。
- 熊本城照片：663highland，[Wikimedia Commons 原圖](https://commons.wikimedia.org/wiki/File:Kumamoto_Castle_03n4272.jpg)，[CC BY 2.5](https://creativecommons.org/licenses/by/2.5/)。僅縮放，未改作；畫面亦標示來源。
- 示範 PDF 由本機工具產生，明確標示 SAMPLE，沒有真實票券條碼或個資。
- Noto Sans TC 與 Zen Maru Gothic 經 Fontsource 本地打包，字型採 SIL Open Font License；授權隨套件提供。
- PDF.js 與標準字型依各自授權使用；`public/pdf-fonts` 保留字型授權檔。
- `npm run assets:demo` 重新產生公開示意附件與圖示，需要本機 Edge；首次下載公開照片需要網路，不讀取使用者原始 PDF。

## 安全與資料限制

匯入內容不傳到後端；地圖按鈕只交付必要目的地。無追蹤分析或第三方遠端程式，但公開應用更新、XSS、相依套件或裝置遭入侵仍有風險。免解鎖模式中，能開啟此 App 的人就能閱讀。IndexedDB 可被清除或回收，不能替代備份；請保留原始設定、旅遊包與定期手動備份。

旅遊包上限 64 MB；單一附件最多 30 MB，製包新增附件合計最多 30 MB，解密後總內容最多 45 MB。原 PDF 約 25 MB 已驗證可製包、匯入、離線閱讀。持久化的 CryptoKey 不可透過 exportKey 匯出，不代表能阻擋同來源惡意程式使用該金鑰。
