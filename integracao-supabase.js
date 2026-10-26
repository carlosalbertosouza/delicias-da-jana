/* Integração progressiva: dados centralizados e ADM autenticado.
   Não publicar antes dos testes e das proteções contra pedidos abusivos. */
(async function(){
'use strict';
const $=id=>document.getElementById(id);
const key=window.JANA_SUPABASE_KEY;
const valid=key&&key.startsWith('sb_publishable_');
const supabaseLib=window.supabase;
const status=document.createElement('div');status.className='notice';status.style.margin='12px 0';
const nav=document.querySelector('nav');nav.insertAdjacentElement('afterend',status);
if(!valid||!supabaseLib){status.textContent='Integração Supabase aguardando chave pública em supabase-config.js. Este arquivo ainda não está pronto para receber pedidos.';document.getElementById('adminTab').disabled=true;document.getElementById('sendWhatsapp').disabled=true;return;}
const db=supabaseLib.createClient(window.JANA_SUPABASE_URL,key);
const toLocal=p=>({id:p.id,name:p.nome,cat:p.categoria,price:p.preco===null?null:Number(p.preco),stock:p.estoque,active:p.ativo,desc:p.descricao||'',photo:p.imagem_url||''});
const toDb=p=>({nome:p.name,categoria:p.cat,preco:p.price,estoque:p.stock,ativo:p.active,descricao:p.desc||'',imagem_url:p.photo||''});
const message=(m)=>{status.textContent=m};
let admin=false;
let busy=false;
const login=document.createElement('div');login.className='panel hide';login.id='adminLogin';login.innerHTML='<h2>Entrar na administração</h2><form id="loginForm"><div class="grid"><label class="field">E-mail<input id="adminEmail" type="email" autocomplete="username" required></label><label class="field">Senha<input id="adminPassword" type="password" autocomplete="current-password" required></label></div><div class="actions"><button type="submit">Entrar</button><button type="button" class="secondary" id="logout">Sair</button></div></form><p class="muted" id="loginStatus"></p>';
$('admin').parentNode.insertBefore(login,$('admin'));
async function checkAdmin(){const {data:{user}}=await db.auth.getUser();if(!user){admin=false;return;}const {data,error}=await db.from('administradores').select('usuario_id').eq('usuario_id',user.id).maybeSingle();admin=!error&&!!data;}
async function load(){const {data,error}=await db.from('produtos').select('*').order('id');if(error){message('Erro ao carregar produtos: '+error.message);return;}products=data.map(toLocal);cart={};render();renderCartBar();if(admin)renderAdmin();message('Conectado ao Supabase • Estoque compartilhado');}
async function save(p){if(!admin)throw Error('Acesso não autorizado');const {error}=await db.from('produtos').update(toDb(p)).eq('id',p.id);if(error)throw error;await load();}
function adminPage(){show('admin');$('admin').classList.toggle('hide',!admin);login.classList.toggle('hide',admin);if(admin)renderAdmin();}
$('adminTab').onclick=async()=>{await checkAdmin();adminPage();};
$('loginForm').onsubmit=async e=>{e.preventDefault();const email=$('adminEmail').value.trim(),password=$('adminPassword').value;$('loginStatus').textContent='Verificando acesso...';const {error}=await db.auth.signInWithPassword({email,password});$('adminPassword').value='';if(error){$('loginStatus').textContent='Não foi possível entrar: '+error.message;return;}await checkAdmin();if(!admin){await db.auth.signOut();$('loginStatus').textContent='Esta conta não tem permissão de administrador.';return;}adminPage();};
$('logout').onclick=async()=>{await db.auth.signOut();admin=false;adminPage()};
// Intercepta eventos antigos antes que alterem somente o armazenamento local.
$('adminProducts').addEventListener('change',async e=>{const el=e.target;const attr=['active','stock','price'].find(x=>el.hasAttribute('data-'+x));if(!attr)return;e.stopImmediatePropagation();e.preventDefault();if(busy)return;busy=true;const p=products.find(x=>x.id===Number(el.getAttribute('data-'+attr)));if(!p){busy=false;return;}const edited={...p};if(attr==='active')edited.active=el.checked;if(attr==='stock')edited.stock=Math.max(0,Math.floor(Number(el.value)||0));if(attr==='price')edited.price=el.value===''?null:Number(el.value);if(edited.price===null)edited.active=false;try{await save(edited)}catch(err){alert('Não foi possível salvar: '+err.message);await load()}finally{busy=false;}},true);
$('adminProducts').addEventListener('click',async e=>{const btn=e.target.closest('[data-delete],[data-photo]');if(!btn)return;e.stopImmediatePropagation();e.preventDefault();if(!admin)return;if(btn.hasAttribute('data-delete')){if(!confirm('Excluir este produto do banco de dados?'))return;const id=Number(btn.dataset.delete);const {error}=await db.from('produtos').delete().eq('id',id);if(error)alert('Não foi possível excluir: '+error.message);await load();return;}const id=Number(btn.dataset.photo);await chooseAndUpload(id);},true);
async function chooseAndUpload(id){const file=document.createElement('input');file.type='file';file.accept='image/*';file.onchange=async()=>{if(!file.files[0])return;const f=file.files[0];if(f.size>5*1024*1024){alert('Escolha foto de até 5 MB');return;}const ext=(f.name.split('.').pop()||'jpg').toLowerCase();if(!['jpg','jpeg','png','webp'].includes(ext)){alert('Use JPG, PNG ou WEBP');return;}const path=`produto-${id}-${Date.now()}.${ext}`;const {error}=await db.storage.from('fotos-produtos').upload(path,f,{contentType:f.type,upsert:false});if(error){alert('Falha no envio da foto: '+error.message);return;}const {data}=db.storage.from('fotos-produtos').getPublicUrl(path);const p=products.find(p=>p.id===id);try{await save({...p,photo:data.publicUrl})}catch(err){alert(err.message)}};file.click()}
$('editChoosePhoto').onclick=async()=>{const id=Number($('editId').value);if(admin)await chooseAndUpload(id)};
$('editRemovePhoto').onclick=async()=>{const p=products.find(x=>x.id===Number($('editId').value));if(p&&confirm('Remover a foto do produto?')){try{await save({...p,photo:''})}catch(err){alert(err.message)}}};
$('editForm').addEventListener('submit',async e=>{e.preventDefault();e.stopImmediatePropagation();if(!admin)return;const p=products.find(x=>x.id===Number($('editId').value));if(!p)return;const name=$('editName').value.trim();if(!name)return alert('Informe o nome');const edited={...p,name,cat:$('editCat').value,desc:$('editDesc').value,price:$('editPrice').value===''?null:Number($('editPrice').value),stock:Math.max(0,Math.floor(Number($('editStock').value)||0)),active:$('editActive').checked&&$('editPrice').value!==''};try{await save(edited);$('editPanel').classList.add('hide');alert('Produto salvo no Supabase!')}catch(err){alert(err.message)}},true);
$('addForm').addEventListener('submit',async e=>{e.preventDefault();e.stopImmediatePropagation();if(!admin)return;const item={nome:$('newName').value.trim(),categoria:$('newCat').value,preco:Number($('newPrice').value),estoque:Math.max(0,Math.floor(Number($('newStock').value)||0)),ativo:true,descricao:$('newDesc').value,imagem_url:''};if(!item.nome)return;const {data,error}=await db.from('produtos').insert(item).select('id').single();if(error){alert(error.message);return;}const f=$('newPhoto').files[0];if(f){const id=data.id;const ext=(f.name.split('.').pop()||'jpg').toLowerCase();if(['jpg','jpeg','png','webp'].includes(ext)&&f.size<=5*1024*1024){const path=`produto-${id}-${Date.now()}.${ext}`;const up=await db.storage.from('fotos-produtos').upload(path,f,{contentType:f.type});if(!up.error){const {data:url}=db.storage.from('fotos-produtos').getPublicUrl(path);await db.from('produtos').update({imagem_url:url.publicUrl}).eq('id',id);}else alert('Produto salvo, mas foto não enviada: '+up.error.message)}}e.target.reset();await load();alert('Produto cadastrado no Supabase!')},true);
for(const id of ['import','reset']){$(id).disabled=true;$(id).title='Desativado na versão conectada para evitar sobrescrever dados';}
$('export').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(products,null,2)],{type:'application/json'}));a.download='backup-produtos.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
// V12: pedidos pendentes não descontam estoque. Apenas o ADM confirma.
const orders=document.getElementById('adminOrders');
// Comanda dentro do ADM, visível na impressão mesmo com checkout oculto.
$('admin').appendChild($('receiptPanel')); 
const refreshOrders=document.getElementById('refreshOrders');
// Impressão direta pelo Bluetooth usando a ponte local do notebook.
async function imprimirBluetooth(p){
 const texto=receiptOrder(p);
 try {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),25000);
  let response;
  try {response=await fetch('http://127.0.0.1:8765/imprimir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto}),signal:controller.signal});}
  finally {clearTimeout(timer);}
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error(result.erro||'Falha na impressão');
  alert('Comanda enviada à impressora Bluetooth MY-7779!');
 } catch(err){
  alert('Não foi possível imprimir pelo Bluetooth. Ligue a MY-7779 e execute INICIAR-IMPRESSORA.bat no notebook.\n\nDetalhes: '+err.message);
 }
}
function receiptOrder(p){return ['DELÍCIAS DA JANA',`PEDIDO #${p.id}`,'----------------------------',`Cliente: ${p.cliente}`,`Local: ${p.local_entrega}`,`Pagamento: ${p.pagamento}`,'----------------------------',...p.itens.map(i=>`${i.quantidade}x ${i.nome}\n   ${money(i.preco*i.quantidade)}`),'----------------------------',`TOTAL: ${money(p.total)}`,...(p.observacoes?[`Observações: ${p.observacoes}`]:[]),'----------------------------','Obrigada pela preferência!'].join('\n')}
async function loadOrders(){if(!admin)return;orders.textContent='Carregando pedidos...';const {data,error}=await db.rpc('listar_pedidos_cardapio');if(error){orders.textContent='Erro ao consultar pedidos: '+error.message;return;}orders.innerHTML=(data||[]).length?data.map(p=>`<div class="adminrow"><div class="name"><strong>Pedido #${p.id} — ${escapeHTML(p.cliente)}</strong><small>${escapeHTML(new Date(p.criado_em).toLocaleString('pt-BR'))} • ${escapeHTML(p.status)}</small><small>${escapeHTML(p.local_entrega)} • ${escapeHTML(p.pagamento)}</small><small>${p.itens.map(i=>`${i.quantidade}× ${escapeHTML(i.nome)}`).join(' | ')}</small><small>Total: ${money(p.total)}</small></div><div class="actions">${p.status==='pendente'?`<button data-confirm="${p.id}">Confirmar venda</button>`:''}${p.status!=='cancelado'?`<button class="secondary" data-cancel="${p.id}">Cancelar</button>`:''}<button class="secondary" data-print-order="${p.id}" ${p.status!=='confirmado'?'disabled':''}>Imprimir comanda</button><button class="secondary" data-copy-order="${p.id}" ${p.status!=='confirmado'?'disabled':''}>Copiar para RawBT</button></div></div>`).join(''):'<p class="muted">Nenhum pedido recebido.</p>';
orders.onclick=async e=>{const b=e.target.closest('button');if(!b)return;const id=Number(b.dataset.confirm||b.dataset.cancel||b.dataset.printOrder||b.dataset.copyOrder);const p=data.find(x=>x.id===id);if(!p)return;if(b.hasAttribute('data-print-order')){await imprimirBluetooth(p);return;}if(b.hasAttribute('data-copy-order')){try{await navigator.clipboard.writeText(receiptOrder(p));alert('Comanda copiada. Abra o RawBT para imprimir.')}catch{alert('Não foi possível copiar. Verifique as permissões do navegador.')}return;}const action=b.hasAttribute('data-confirm')?'confirmar':'cancelar';if(!confirm(action==='confirmar'?`Você recebeu o pedido #${id} pelo WhatsApp e quer confirmar a venda e descontar o estoque?`:`Cancelar pedido #${id}? Se já confirmado, o estoque será devolvido.`))return;b.disabled=true;const result=await db.rpc('alterar_status_pedido_cardapio',{p_pedido_id:id,p_acao:action});if(result.error)alert('Não foi possível alterar o pedido: '+result.error.message);await load();await loadOrders();};
}
refreshOrders.onclick=loadOrders;
const oldAdminPage=adminPage;adminPage=function(){oldAdminPage();if(admin)loadOrders()};
$('sendWhatsapp').onclick=async()=>{if(busy)return;const t=receiptText();if(!t)return;const entries=selected();if(!entries.length)return;const place=$('place').value.trim();if(!place)return alert('Informe o local de entrega ou retirada.');if(!confirm('Registrar pedido como AGUARDANDO CONFIRMAÇÃO e abrir o WhatsApp? O estoque não será descontado agora.'))return;busy=true;$('sendWhatsapp').disabled=true;try{const {data,error}=await db.rpc('criar_pedido_cardapio',{p_cliente:$('customer').value.trim(),p_local_entrega:place,p_pagamento:$('payment').value,p_observacoes:$('notes').value,p_itens:entries.map(({p,q})=>({produto_id:p.id,quantidade:q}))});if(error)throw error;const pedido=`PEDIDO #${data.pedido_id}\n${t}\n\nAguardando confirmação da loja.`;const link='https://wa.me/5513991384104?text='+encodeURIComponent(pedido);const opened=window.open(link,'_blank','noopener');if(!opened)window.location.href=link;cart={};await load();renderCheckout();renderCartBar();message('Pedido #'+data.pedido_id+' aguardando confirmação. Envie a mensagem no WhatsApp.');}catch(err){alert('Pedido não registrado: '+err.message);await load()}finally{busy=false;$('sendWhatsapp').disabled=false;}};
$('admin').querySelector('.panel .muted').textContent='Gerencie produtos e estoque sincronizados no Supabase. É necessário entrar com a conta administradora.';
$('admin').querySelector('.notice').textContent='Ambiente de testes. Não compartilhe o link antes de validar as proteções contra pedidos falsos ou duplicados.';
$('checkout').querySelector('.muted').textContent='O pedido ficará aguardando confirmação. O estoque só será descontado quando a loja confirmar a venda no ADM. Abra o WhatsApp e toque em Enviar.';
await checkAdmin();await load();if(window.JANA_MODO_ADMIN){adminPage();}if(admin)loadOrders();
})();
