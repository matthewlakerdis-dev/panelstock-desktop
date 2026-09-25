/* The parent application owns navigation and login; credentials never cross URLs. */
(()=>{
 if(window.parent===window&&location.protocol!=='file:'){location.replace('../?page=cad');return;}
 if(window.parent===window&&location.protocol!=='file:'){location.replace('../?page=cad');return;}
 if(window.parent!==window&&new URLSearchParams(location.search).get('embedded')==='1'){
  document.body.classList.add('embedded-cad');
 }
})();