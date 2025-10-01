// src/hooks/useMe.js
import { useEffect, useState } from 'react';

export default function useMe() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    (async()=>{
      try{
        const r = await fetch('/api/session/me', { credentials: 'include' });
        if (!r.ok) throw new Error('UNAUTHORIZED');
        const j = await r.json();
        setData(j);
      }catch(e){
        setData(null);
      }finally{
        setLoading(false);
      }
    })();
  },[]);

  return { data, loading };
}
