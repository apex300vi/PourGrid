(function(root,factory){
  var api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PourGridSmartCountLauncher=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";
  function create(options){
    options=options||{};var opening=false,lastTouchAt=0;
    function fail(message,error){
      if(options.showError)options.showError(message,error);
      return false;
    }
    function open(args){
      if(opening||(options.findModal&&options.findModal()))return false;
      if(options.isReady&&!options.isReady())return fail("Smart Count recognition is unavailable. Refresh the staging app or continue with manual counting.");
      opening=true;
      try{
        if(typeof options.openModal!=="function")return fail("Smart Count could not initialize. Continue with manual counting and report this staging error.");
        options.openModal(args.products,args.isG,args.onDone);return true;
      }catch(error){
        return fail("Smart Count could not initialize. Continue with manual counting and report this staging error.",error);
      }finally{opening=false;}
    }
    function bind(button,getArgs){
      if(!button||button.dataset.pgSmartCountBound)return button;
      button.dataset.pgSmartCountBound="1";button.type="button";
      function activate(event){
        if(event&&event.type==="click"&&Date.now()-lastTouchAt<700)return;
        if(event&&event.type==="touchend"){lastTouchAt=Date.now();if(event.preventDefault)event.preventDefault();}
        open(getArgs());
      }
      button.addEventListener("click",activate);
      button.addEventListener("touchend",activate,{passive:false});
      return button;
    }
    return {open:open,bind:bind};
  }
  return {create:create};
});
