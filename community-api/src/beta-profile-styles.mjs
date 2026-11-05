/* Private staging presentation only. Matches the BAS Community soft violet aesthetic. */
export const profileStyles = `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;
--bg:#0d1120;--surface:#171b2d;--outline:#41445f;--text:#f8f5ff;--muted:#c0bad1;--violet:#bfa1fa;
background:var(--bg);color:var(--text)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:
radial-gradient(ellipse 75% 360px at 85% -70px,#42285e 0%,transparent 85%),
radial-gradient(ellipse 75% 470px at -25% 25%,#172745 0%,transparent 80%),var(--bg)}
a{color:#dbbdff}.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;
padding:20px max(20px,calc((100% - 1030px)/2));border-bottom:1px solid #ffffff12;background:#0c1020ba}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;font-size:14px;
font-weight:650;letter-spacing:.015em}.brand b{font-weight:800}.brand-mark{font-size:29px;color:#d7baff}
.tag,.coming{font-size:10px;letter-spacing:.09em;font-weight:800;color:#e0cbff;
border-radius:999px;border:1px solid #73578d;background:#362744;padding:8px 11px}
.layout{max-width:1030px;padding:0 22px 55px;margin:auto}.welcome{padding:43px 0 22px}
.eyebrow{margin:0;color:#cdaafc;letter-spacing:.15em;font-size:11px;font-weight:800}
h1{font-size:clamp(28px,5.2vw,48px);letter-spacing:-.045em;line-height:1.12;margin:12px 0}
h1 em{color:#d8b8ff;font-style:normal}h2,h3{letter-spacing:-.02em}
p{line-height:1.55;color:var(--muted)}
.welcome>p:last-child{font-size:14px;margin:0}
#status{margin:0 0 16px;min-height:18px;color:#e4cdfc;font-size:13px}
#guest[hidden],#member[hidden],.editor[hidden],.profile-card[hidden],.creations[hidden],dialog:not([open]){display:none}
.panel{background:linear-gradient(140deg,#1b2034,#141829);border:1px solid var(--outline);
border-radius:18px;padding:25px;box-shadow:0 16px 50px #0003}
.guest{max-width:600px}.guest h2{margin-top:0}
.profile-card{border-radius:22px;overflow:hidden;background:var(--surface);border:1px solid #50446f;
box-shadow:0 18px 56px #0005}
.cover{height:clamp(175px,27vw,284px);position:relative;overflow:hidden;
background:linear-gradient(114deg,#4f3e83,#805f9a 46%,#cc8ba8);isolation:isolate}
.cover:before,.cover:after{content:'';position:absolute;inset:0;pointer-events:none}
.cover:before{background:radial-gradient(circle at 73% 20%,#ffffff45,transparent 33%),
radial-gradient(circle at 21% 85%,#5d68bd88,transparent 42%)}
.cover:after{background:linear-gradient(0deg,#121a3044,transparent 70%)}
.cover>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cover>img[hidden],.avatar img[hidden]{display:none}
.cover-symbol{font-size:clamp(85px,18vw,190px);font-weight:300;position:absolute;right:10%;top:8%;
color:#ffffff55;line-height:1;pointer-events:none}
.cover:has(img:not([hidden])) .cover-symbol{display:none}
.cover-action{position:absolute;right:20px;bottom:20px;z-index:1;
background:#0d1021ad;border:1px solid #ffffff70;color:#fff}
.profile-body{padding:0 clamp(20px,4vw,40px) 31px}
.identity{display:flex;align-items:end;gap:20px;flex-wrap:wrap;margin-top:-46px;position:relative;z-index:2}
.avatar{flex:0 0 105px;width:105px;height:105px;border-radius:50%;background:linear-gradient(130deg,#8668d8,#e4a7d8);
border:5px solid #171b2d;display:grid;place-items:center;overflow:hidden;box-shadow:0 9px 24px #0a092b80}
.avatar>span{font-size:44px;color:white}
.avatar img{width:100%;height:100%;object-fit:cover;grid-area:1/1}
.identity-names{flex:1;min-width:160px;padding-top:55px}
.identity-names h2{margin:0;font-size:clamp(21px,3.3vw,31px);line-height:1.2}
.identity-names p{margin:4px 0;color:#c7b4e7;font-size:15px}
.joined{font-size:12px;color:#a8a3b9}
.identity>.btn{margin:0 0 11px auto}
.profile-bio{margin-top:26px;background:#0f1629a8;border:1px solid #ffffff13;padding:17px 19px;
border-radius:14px}.profile-bio h3{margin:0;font-size:13px;color:#e7d6ff}
.profile-bio p{margin:9px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.profile-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
.creations{margin-top:24px;min-height:260px;text-align:center}
.section-heading{display:flex;justify-content:space-between;align-items:center;text-align:left}
.section-heading h2{margin:6px 0;font-size:23px}.coming{color:#cbb6e8;background:#32253f;font-size:10px}
.empty-icon{font-size:44px;color:#ba97e8;margin-top:22px}.creations>h3{font-size:19px;margin:0}
.creations>p{max-width:480px;margin:9px auto;font-size:14px}
.btn,button{font:700 13px system-ui;cursor:pointer;padding:12px 18px;border-radius:11px;
border:1px solid #7d699b;transition:background .14s ease,transform .14s ease}
.btn:active,button:active{transform:translateY(1px)}
.btn.primary{background:#9a6fe2;color:#180e2e;border-color:#ba99ee}
.btn.outline{background:#15182acc;color:#f4eaff;border-color:#7d6c9f}
.btn.subtle{background:#322741;color:#e9d6ff;border-color:#6d568a}
.btn:hover,button:hover{filter:brightness(1.11)}
.btn:disabled,button:disabled{opacity:.55;cursor:wait}
.community-catalog,.moderation-panel{margin-top:24px}
.license-row{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px}
.license-help{font-size:12px;color:#e0c0ff;text-decoration:underline}
.tag-chips{display:flex;flex-wrap:wrap;gap:8px;margin:9px 0}
.tag-chips button{background:#3f3156;border:1px solid #8868b5;color:#fbf4ff;font-size:12px;padding:7px 10px;border-radius:999px}
.catalog-search{display:flex;gap:9px;align-items:center;margin-top:9px}
.catalog-search input{flex:1;width:auto}.catalog-results{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:20px}
.catalog-card{background:#10182b;border:1px solid #69567e;border-radius:14px;padding:16px}
.catalog-card h3{margin:0 0 6px}.catalog-card p{font-size:13px}
.catalog-card .tag{display:inline-block;background:#342b50;border-radius:8px;padding:4px 7px;margin:3px;color:#e9d1ff;font-size:11px}
.moderation-item{background:#10182b;padding:14px;margin:10px 0;border:1px solid #66517b;border-radius:13px}
.moderation-item .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}
.guide h2{margin:27px 0 8px;font-size:22px}.guide h2:first-child{margin-top:0}
.publish-panel{margin-top:24px}.publish-panel form{max-width:690px}
.publish-panel form>label:not(.checkline){display:block;margin:17px 0 7px;font-weight:750;font-size:13px}
.publish-panel select,.publish-panel input[type=file]{width:100%;padding:12px 14px;border:1px solid #706383;
border-radius:11px;color:#f4edff;background:#101526}
.publish-panel .checkline{display:flex;align-items:flex-start;gap:10px;font-size:13px;margin:16px 0}
.publish-panel .checkline input{flex:0 0 auto;width:auto;max-width:none;margin-top:4px}
.draft-list{list-style:none;padding:0;display:grid;gap:10px}
.draft-list li{border:1px solid #6a567a;border-radius:12px;background:#11182b;padding:12px}
.draft-list strong{display:block;color:#fff}.draft-list span{color:#baa9d2;font-size:12px}
#publish-status{min-height:20px;color:#d9bef8}
.editor{margin-top:24px}.editor-header{display:flex;justify-content:space-between;gap:12px;align-items:start}
.editor-header h2{margin:6px 0 10px;font-size:25px}
#profile-form{max-width:690px;margin-top:16px}
#profile-form>label{display:block;font-size:13px;font-weight:750;margin:18px 0 7px}
input:not([type=file]),textarea{display:block;max-width:100%;width:100%;padding:12px 14px;border-radius:10px;
border:1px solid #706383;background:#101526;color:var(--text);font:15px/1.4 system-ui}
input[type=range]{accent-color:#be9ded;width:100%}
.hint{font-size:12px;margin:6px 0 0;color:#ada4c1}
.photo-options,.form-actions{display:flex;flex-wrap:wrap;gap:11px;margin-top:22px}
.form-actions{justify-content:flex-end}
:focus-visible{outline:3px solid #dfbaff;outline-offset:3px}
footer{padding:30px 0;color:#9f97b3;text-align:center;font-size:12px}
dialog{position:fixed;top:50%;transform:translateY(-50%);margin:auto;width:min(92vw,680px);
max-height:90vh;overflow-y:auto;border:1px solid #7c619c;border-radius:18px;padding:24px;
background:#171a2d;color:#f5ecff;box-shadow:0 30px 110px #000b}
dialog::backdrop{background:#080914d9;backdrop-filter:blur(5px)}
.crop-heading{display:flex;justify-content:space-between;align-items:start;gap:12px}
.crop-heading h2{margin:5px 0;font-size:24px}.crop-stage{width:min(100%,560px);height:310px;margin:16px auto;
border-radius:14px;background:#090c19;overflow:hidden;position:relative;touch-action:none;cursor:grab}
.crop-stage.banner{height:auto;aspect-ratio:8/3}.crop-stage.avatar{width:min(100%,340px);height:auto;aspect-ratio:1/1;border-radius:50%}
.crop-stage img{position:absolute;max-width:none;user-select:none;pointer-events:none;transform-origin:0 0}
.crop-guides{position:absolute;inset:0;border:1px solid #ffffff7d;pointer-events:none;box-shadow:inset 0 0 0 1px #0005}
.zoom-label{display:flex;justify-content:space-between;font-size:13px;color:#e2ceff}
input[hidden]{display:none}
@media(max-width:580px){.tag{font-size:9px;padding:6px}.topbar{padding:16px 17px}
.layout{padding:0 14px 42px}.welcome{padding:30px 3px 18px}
.panel{padding:19px}.identity{gap:11px}.avatar{flex-basis:85px;width:85px;height:85px}
.identity-names{padding-top:46px}.identity>.btn{margin:2px 0 0;width:100%}
.profile-body{padding:0 17px 22px}.cover-action{bottom:14px;right:14px}
.crop-stage{height:250px}.crop-stage.banner{height:auto;aspect-ratio:8/3}.crop-stage.avatar{height:auto;width:min(70vw,290px);aspect-ratio:1/1}}
`;
