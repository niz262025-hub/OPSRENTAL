import {myopsOrigin} from './myops-origin.js';
// Navigation only: the central session and application cookie are untouched.
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try{return res.redirect(302,myopsOrigin()+'/');}
 catch{return res.status(503).json({error:'MYOPS destination is not configured'});}
}
