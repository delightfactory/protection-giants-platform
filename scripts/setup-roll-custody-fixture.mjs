import { randomUUID } from "node:crypto";
const { API_URL:u,SERVICE_ROLE_KEY:s,ANON_KEY:a }=process.env;
if(!u||!s||!a)throw new Error("Local Supabase environment required");
const p="Roll-Custody-Foundation-2026!";
async function q(path,{method="GET",token=a,key=a,body,prefer=false}={}){const h={apikey:key,Authorization:`Bearer ${token}`};if(body!==undefined){h["Content-Type"]="application/json";if(prefer)h.Prefer="return=representation"}const r=await fetch(`${u}${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const t=await r.text();let b=null;try{b=t?JSON.parse(t):null}catch{b=t}return{r,b}}
async function user(email,role,country_agent_id=null){const x=await q("/auth/v1/admin/users",{method:"POST",token:s,key:s,body:{email,password:p,email_confirm:true,app_metadata:{pg_provisioning:{version:"operational-v1",role,country_agent_id,dealer_id:null,installation_center_id:null}},user_metadata:{display_name:`Custody ${role}`}}});if(!x.r.ok)throw new Error(JSON.stringify(x.b))}
async function login(email){const x=await q("/auth/v1/token?grant_type=password",{method:"POST",body:{email,password:p}});if(!x.r.ok)throw new Error(JSON.stringify(x.b));return x.b.access_token}
const rest=(x,t,o={})=>q(`/rest/v1/${x}`,{...o,token:t});
await user("roll-custody-admin@example.test","admin");const admin=await login("roll-custody-admin@example.test");
let x=await rest("country_agents?select=id",admin,{method:"POST",prefer:true,body:{code:"CUSTODY-AGENT-EG",name:"Roll Custody Test Agent",country_code:"EG"}});const agent=x.b[0];
await user("roll-custody-agent@example.test","agent",agent.id);
x=await rest("products?select=id",admin,{method:"POST",prefer:true,body:{code:"PG-CUSTODY-TEST",name:"Roll Custody Test PPF",slug:"roll-custody-test-ppf",product_type:"PPF",default_warranty_months:120,width_mm:1524,length_m:15,thickness_mil:7.5,weight_kg:12.5,origin_country:"USA",publication_status:"draft"}});const product=x.b[0];
x=await rest("rpc/create_production_order",admin,{method:"POST",body:{p_request_id:randomUUID(),p_product_id:product.id,p_production_date:"2026-08-13",p_lots:[{quantity:2,source_reference:"CUSTODY-LOT"}],p_source_reference:"CUSTODY-PO",p_notes:"Cube D verification"}});if(!x.r.ok)throw new Error(JSON.stringify(x.b));console.log("Roll custody fixture created.");
