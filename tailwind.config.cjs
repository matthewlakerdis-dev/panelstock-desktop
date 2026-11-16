const path=require('node:path');
module.exports={
  content:['index.html','panelstock-client.js','order-dispatch-reversal.js','site-order-bulk-dispatch.js'].map(file=>path.join(__dirname,file)),
  theme:{extend:{}},
  plugins:[]
};

