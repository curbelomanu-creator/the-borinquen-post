#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { generateShareImage } = require('./generate-share-image');

const CATEGORY_MAP = { economia:'economia', empresas:'empresas', gobierno:'gobierno', internacional:'internacional', mercados:'mercados', tribunales:'tribunales' };
const PUERTO_RICO_OFFSET = '-04:00';

function normalizeText(value){return (value||'').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function normalizeCategory(categoryRaw){return CATEGORY_MAP[normalizeText(categoryRaw)]||null;}
function toISODate(value){if(!value)return null;const trimmed=value.toString().trim();if(!trimmed)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(trimmed))return trimmed;if(/^\d+$/.test(trimmed)){const serial=Number(trimmed);if(!Number.isNaN(serial)&&serial>0){const d=new Date(Date.UTC(1899,11,30)+serial*86400000);if(!Number.isNaN(d.getTime()))return d.toISOString().slice(0,10);}}const parsed=new Date(trimmed);return Number.isNaN(parsed.getTime())?null:parsed.toISOString().slice(0,10);}
function getTodayISO(){return new Date().toISOString().slice(0,10);}
function parsePublishAt(value){
  if(!value)return null;
  const text=String(value).trim(); if(!text)return null;
  let m=text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AST))?$/i);
  if(m){const hh=String(Number(m[2])).padStart(2,'0');return {date:m[1], timestamp:`${m[1]} ${hh}:${m[3]}:${m[4]||'00'} ${PUERTO_RICO_OFFSET}`, instant:new Date(`${m[1]}T${hh}:${m[3]}:${m[4]||'00'}${PUERTO_RICO_OFFSET}`)};}
  if(/^\d+(?:\.\d+)?$/.test(text)){const serial=Number(text);const whole=Math.floor(serial),frac=serial-whole;const base=new Date(Date.UTC(1899,11,30)+whole*86400000);const totalMinutes=Math.round(frac*1440);const hh=String(Math.floor(totalMinutes/60)%24).padStart(2,'0'),mm=String(totalMinutes%60).padStart(2,'0');const date=base.toISOString().slice(0,10);return {date,timestamp:`${date} ${hh}:${mm}:00 ${PUERTO_RICO_OFFSET}`, instant:new Date(`${date}T${hh}:${mm}:00${PUERTO_RICO_OFFSET}`)};}
  const parsed=new Date(text);if(!Number.isNaN(parsed.getTime())){const date=parsed.toISOString().slice(0,10);const hh=String(parsed.getHours()).padStart(2,'0'),mm=String(parsed.getMinutes()).padStart(2,'0'),ss=String(parsed.getSeconds()).padStart(2,'0');return {date,timestamp:`${date} ${hh}:${mm}:${ss} ${PUERTO_RICO_OFFSET}`, instant:parsed};}
  return null;
}
const BYLINE_PREFIX='Redacción por The Borinquen Post.';
function makeDescription(body){const clean=body.replace(/\s+/g,' ').trim();return clean.length<=160?clean:`${clean.slice(0,157).trimEnd()}...`;}
function yamlEscape(value){return String(value||'').replace(/"/g,'\\"');}
function normalizeBody(bodyRaw){const body=(bodyRaw||'').trim();if(!body)return body;if(body.startsWith(BYLINE_PREFIX)){const rest=body.slice(BYLINE_PREFIX.length).trimStart();const bylineHtml='<p class="article-byline-note"><em>Redacción por The Borinquen Post.</em></p>';return rest?`${bylineHtml}\n\n${rest}`:bylineHtml;}return body;}
function readSiteBaseUrl(){const fallback='https://theborinquenpost.com',p=path.join(process.cwd(),'_config.yml');if(!fs.existsSync(p))return fallback;const raw=fs.readFileSync(p,'utf8');let url='',baseurl='';for(const line of raw.split(/\r?\n/)){const m=line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);if(!m)continue;const v=m[2].trim().replace(/^['"]|['"]$/g,'');if(m[1]==='url')url=v;if(m[1]==='baseurl')baseurl=v;}if(url){const u=url.replace(/\/+$/,'');const b=baseurl?`/${baseurl.replace(/^\/+|\/+$/g,'')}`:'';return `${u}${b}`;}return fallback;}
function buildPublicImageUrl(baseUrl,filename){return `${baseUrl.replace(/\/+$/,'')}/assets/images/generated/${filename}`;}

async function main(){
 const sheetId=process.env.GOOGLE_SHEET_ID,sheetName=process.env.GOOGLE_SHEET_NAME||'Hoja 1',serviceAccountJson=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;if(!sheetId)throw new Error('Falta GOOGLE_SHEET_ID');if(!serviceAccountJson)throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
 const credentials=JSON.parse(serviceAccountJson);const auth=new google.auth.GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets']});const sheets=google.sheets({version:'v4',auth});
 const response=await sheets.spreadsheets.values.get({spreadsheetId:sheetId,range:`${sheetName}!A:P`});const rows=response.data.values||[],dataRows=rows.slice(1),siteBaseUrl=readSiteBaseUrl();const postsDir=path.join(process.cwd(),'_posts');if(!fs.existsSync(postsDir))fs.mkdirSync(postsDir,{recursive:true});
 let createdCount=0,skippedCount=0,futureCount=0;const existingFiles=[],invalidCategories=new Set();
 for(let i=0;i<dataRows.length;i+=1){const row=dataRows[i];const [titleRaw,bodyRaw,categoryRaw,sourceRaw,seoTitleRaw,seoDescriptionRaw,slugRaw,dateRaw,fraseImagenRaw,authorRaw,,,publishAtRaw]=row;const sheetRowNumber=i+2;const title=(titleRaw||'').trim(),body=normalizeBody(bodyRaw),slug=(slugRaw||'').trim();if(!title||!body||!categoryRaw||!slug){skippedCount++;continue;}const normalizedCategory=normalizeCategory(categoryRaw);if(!normalizedCategory){skippedCount++;invalidCategories.add((categoryRaw||'').trim());continue;}
 const publishAt=parsePublishAt(publishAtRaw);
 if(publishAt?.instant && publishAt.instant.getTime()>Date.now()){futureCount++;console.log(`⏳ Pendiente hasta ${publishAt.timestamp}: ${slug}`);continue;}
 const date=publishAt?.date||toISODate(dateRaw)||getTodayISO();const articleDate=publishAt?.timestamp||date;const filename=`${date}-${slug}.md`,filepath=path.join(postsDir,filename);if(fs.existsSync(filepath)){skippedCount++;existingFiles.push(filename);continue;}
 const seoTitle=(seoTitleRaw||'').trim()||title,description=(seoDescriptionRaw||'').trim()||makeDescription(body),author=(authorRaw||'').trim()||'The Borinquen Post',source=(sourceRaw||'').trim(),fraseImagen=(fraseImagenRaw||'').trim()||title;const fallbackImage='/assets/images/default.jpg';let instagramImage=fallbackImage,webImage=fallbackImage,storyImage=fallbackImage,imageGenerated=false;
 try{const generated=await generateShareImage({phrase:fraseImagen,category:normalizedCategory,slug});instagramImage=generated.instagramImage||fallbackImage;webImage=generated.webImage||fallbackImage;storyImage=generated.storyImage||fallbackImage;imageGenerated=true;}catch(error){console.warn(`⚠️ No se pudo generar imagen para ${slug}: ${error.message}`);}
 const lines=['---','layout: post',`title: "${yamlEscape(title)}"`,`seo_title: "${yamlEscape(seoTitle)}"`,`description: "${yamlEscape(description)}"`,`date: "${articleDate}"`,`author: "${yamlEscape(author)}"`,`category: "${normalizedCategory}"`,`categories: ["${normalizedCategory}"]`,`image: "${yamlEscape(webImage)}"`,`web_image: "${yamlEscape(webImage)}"`,`instagram_image: "${yamlEscape(instagramImage)}"`,`story_image: "${yamlEscape(storyImage)}"`,`featured_image: "${yamlEscape(webImage)}"`,`thumbnail: "${yamlEscape(webImage)}"`,`cover: "${yamlEscape(webImage)}"`,`og_image: "${yamlEscape(instagramImage)}"`,`twitter:image: "${yamlEscape(instagramImage)}"`,`sources: "${yamlEscape(source)}"`,`slug: "${yamlEscape(slug)}"`,'---','',body,''];fs.writeFileSync(filepath,lines.join('\n'));createdCount++;console.log(`✅ Creado: _posts/${filename} (${articleDate})`);
 if(imageGenerated){const imagePublicUrl=buildPublicImageUrl(siteBaseUrl,`${slug}.png`),storyPublicUrl=buildPublicImageUrl(siteBaseUrl,`${slug}-story.png`);await sheets.spreadsheets.values.batchUpdate({spreadsheetId:sheetId,requestBody:{valueInputOption:'RAW',data:[{range:`${sheetName}!K${sheetRowNumber}`,values:[[imagePublicUrl]]},{range:`${sheetName}!P${sheetRowNumber}`,values:[[storyPublicUrl]]}]}});}
 }
 console.log(`Posts creados: ${createdCount}; pendientes por hora: ${futureCount}; omitidos: ${skippedCount}; existentes: ${existingFiles.length}; categorías inválidas: ${invalidCategories.size}`);
}
main().catch(error=>{console.error('❌ Error en publish-from-sheet:',error.message);process.exit(1);});
