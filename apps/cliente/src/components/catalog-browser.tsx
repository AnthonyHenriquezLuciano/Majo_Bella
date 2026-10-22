/* Catálogo MAJOBELLA · categorías negras, servicios y subservicios minimalistas. */
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { colors, space } from '@majobella/core';
import { T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';
import { ServiceCard } from './service-card';

export function CatalogBrowser() {
  const { studio } = useApp();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const cats = studio.catalogCategories.length
    ? studio.catalogCategories
    : studio.categories().map((name, i) => ({ id: 'local-' + i, name }));
  const current = cats.find(c => c.id === categoryId);
  const items = current ? studio.services.filter(s => s.categoryId === current.id || s.category === current.name) : [];
  const groups = current ? studio.serviceGroups.filter(g => g.categoryId === current.id) : [];
  const direct = items.filter(s => !s.parentId || !groups.some(g => g.id === s.parentId));

  if (!current) return (
    <View style={{ gap: 12, marginBottom: space.md }}>
      {cats.map(c => {
        const total = studio.services.filter(s => s.categoryId === c.id || s.category === c.name).length;
        return <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Explorar ${c.name}`}
          onPress={() => { setCategoryId(c.id); setExpanded(null); }}
          style={({pressed})=>({backgroundColor: pressed ? '#242424' : '#111111',minHeight:152,borderRadius:25,
            padding:22,overflow:'hidden',justifyContent:'space-between'})}>
          <Image source={require('../../assets/images/monograma.png')} resizeMode="contain"
            style={{position:'absolute',right:-48,bottom:-56,width:210,height:210,opacity:0.12,tintColor:'#ffffff'}}/>
          <T v="small" style={{color:'#aaaaaa',letterSpacing:2,fontSize:10}}>MAJOBELLA · CATEGORÍA</T>
          <View style={{gap:6}}>
            <T v="h2" style={{fontSize:29,color:'#ffffff'}}>{c.name}</T>
            <T v="small" style={{color:'#cccccc'}}>{total} {total === 1 ? 'servicio' : 'opciones'}</T>
          </View>
          <T v="small" style={{color:'#ffffff',marginTop:6}}>Explorar →</T>
        </Pressable>;
      })}
    </View>
  );

  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => { setCategoryId(null); setExpanded(null); }}
        style={{alignSelf:'flex-start',paddingVertical:11}}>
        <T v="small" style={{textDecorationLine:'underline'}}>← Todas las categorías</T>
      </Pressable>
      <T v="small" style={{color:colors.muted,letterSpacing:2,marginTop:12}}>MAJOBELLA · SERVICIOS</T>
      <T v="h2" style={{fontSize:34,marginTop:6,marginBottom:20}}>{current.name}</T>
      {groups.map(g => {
        const choices=items.filter(s => s.parentId === g.id);
        const open=expanded===g.id;
        return <View key={g.id} style={{borderRadius:20,borderWidth:1,borderColor:'#dddddd',marginBottom:12,overflow:'hidden',backgroundColor:colors.paper}}>
          <Pressable accessibilityRole="button" accessibilityState={{expanded:open}}
            onPress={() => setExpanded(open ? null : g.id)}
            style={{padding:19}}>
            <T v="h3">{g.name}</T>
            {g.description ? <T v="muted" style={{marginTop:5}}>{g.description}</T> : null}
            <T v="small" style={{marginTop:10,color:colors.muted}}>{open ? 'Ocultar opciones ↑' : `Ver ${choices.length} opciones ↓`}</T>
          </Pressable>
          {open ? <View style={{padding:12,borderTopWidth:1,borderTopColor:'#eeeeee'}}>
            {choices.map(s => <ServiceCard key={s.id} s={s} />)}
            {!choices.length ? <T v="muted">Aún no hay opciones disponibles.</T> : null}
          </View> : null}
        </View>;
      })}
      {direct.map(s => <ServiceCard key={s.id} s={s} />)}
      {!groups.length && !direct.length ? <T v="muted">Aún no hay servicios disponibles.</T> : null}
    </View>
  );
}
