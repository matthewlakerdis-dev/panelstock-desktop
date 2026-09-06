const fs=require('node:fs');
const path=require('node:path');
const postcss=require('postcss');
const tailwind=require('tailwindcss');
const root=path.resolve(__dirname,'..');
async function main(){
  const input=path.join(root,'tailwind-input.css'),output=path.join(root,'tailwind.css');
  const config=require(path.join(root,'tailwind.config.cjs'));
  const result=await postcss([tailwind(config)]).process(fs.readFileSync(input,'utf8'),{from:input,to:output,map:false});
  const css=result.css.replace(/\r\n/g,'\n').trimEnd()+'\n';
  if(process.argv.includes('--check')){
    const saved=fs.existsSync(output)?fs.readFileSync(output,'utf8').replace(/\r\n/g,'\n'):'';
    if(saved!==css)throw Error('tailwind.css is stale. Run npm run build:css and commit the generated stylesheet.');
    console.log('Stylesheet matches current UI classes.');
  }else{fs.writeFileSync(output,css);console.log('Built tailwind.css.');}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

