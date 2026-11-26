const path=require('node:path');
module.exports={
  content:['cnc-order-qa-reset.js','cnc-order-id-reupload.js','index.html','qa-panel-area-import.js','reports-page.js','panelstock-client.js','order-dispatch-reversal.js','site-order-bulk-dispatch.js','active-orders-report.js'].map(file=>path.join(__dirname,file)),
  theme:{extend:{}},
  plugins:[]
};

