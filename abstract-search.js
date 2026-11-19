let thesaurusPromise;

function syncAbstractSearch(){
 const source=$('source').value;
 $('abstractSearchControl').hidden=['website','folder'].includes(source);
}
function setAbstractSearch(enabled){
 $('abstractSearch').checked=enabled;
 localStorage.setItem('abstractSearch',enabled?'1':'0');
}
function initAbstractSearch(){
 setAbstractSearch(localStorage.getItem('abstractSearch')==='1');
 $('abstractSearch').onchange=()=>setAbstractSearch($('abstractSearch').checked);
 syncAbstractSearch();
}
function clearSearchTerms(){
 $('searchTerms').hidden=true;
 $('searchTermsList').replaceChildren();
}
function recordSearchTerm(term){
 const row=document.createElement('li');
 row.textContent=term;
 $('searchTermsList').append(row);
 $('searchTerms').hidden=false;
}
function getThesaurus(){
 if(!thesaurusPromise){
   thesaurusPromise=fetch('/thesaurus.json').then(response=>{
     if(!response.ok)throw Error('Related terms are unavailable.');
     return response.json();
   }).catch(error=>{thesaurusPromise=null;throw error;});
 }
 return thesaurusPromise;
}
function searchVariants(seed,thesaurus){
 const normalize=value=>value.toLowerCase().replace(/[^\p{L}\p{N} -]+/gu,' ').trim().replace(/\s+/g,' ');
 const phrases=[...new Set(seed.split(',').map(normalize).filter(Boolean))];
 const variants=phrases.map(phrase=>{
   const direct=Object.hasOwn(thesaurus,phrase)?thesaurus[phrase]:[];
   const words=phrase.split(' ');
   if(words.length===1)return direct;
   const last=words.at(-1);
   const related=Object.hasOwn(thesaurus,last)?thesaurus[last]:[];
   return [...direct,...related.map(word=>[...words.slice(0,-1),word].join(' '))];
 });
 const results=new Set(),originals=new Set(phrases);
 originals.add(phrases.join(' '));
 for(let i=0;variants.some(group=>group.length>i);i++)for(const group of variants){
   if(group[i]&&!originals.has(group[i]))results.add(group[i]);
   if(results.size===6)return [...results];
 }
 return [...results];
}
async function* abstractSearchPages(query,token){
 yield* searchAllPages(query);
 if(token!==searchToken)return;
 const seed=query.get('words').trim();
 if(!seed)return;
 let terms;
 try{terms=searchVariants(seed,await getThesaurus());}
 catch(error){yield {items:[],issue:error.message};return;}
 if(!terms.length||token!==searchToken)return;
 recordSearchTerm(seed);
 for(const term of terms){
   if(token!==searchToken)return;
   recordSearchTerm(term);
   report('Trying related search: '+term+'…');
   const next=new URLSearchParams(query);
   next.set('words',term);
   let pages=0;
   for await(const page of searchAllPages(next)){
     yield page;
     if(++pages===3||token!==searchToken)break;
   }
 }
}
