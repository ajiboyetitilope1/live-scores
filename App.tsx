import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HOST = 'sportapi7.p.rapidapi.com';
const BASE = `https://${HOST}/api/v1`;
const TODAY_CATEGORIES = [1, 7, 30, 31, 32, 1465]; // England, France, Germany, Italy, Spain, Europe
const scheduleCache: Record<string, Match[]> = {};
type AnyObj = Record<string, any>;
type Match = AnyObj & { id: number; homeTeam?: AnyObj; awayTeam?: AnyObj; homeScore?: AnyObj; awayScore?: AnyObj; status?: AnyObj; tournament?: AnyObj; startTimestamp?: number };
type PickOutcome = 'home' | 'draw' | 'away';
type MatchPick = { eventId: number; match: Match; outcome: PickOutcome; points: number; createdAt: number };
const PICKS_KEY = 'matchday.pointsPicks.v1';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const SAVED_KEY = 'matchday.savedMatches.v1';
const unwrap = (x: any): any[] => Array.isArray(x) ? x : x?.events || x?.results || x?.tournaments || x?.standings || x?.rows || [];

async function api(path: string) {
  const key = process.env.EXPO_PUBLIC_RAPIDAPI_KEY;
  if (!key) throw new Error('Add EXPO_PUBLIC_RAPIDAPI_KEY to .env.local, then restart Expo.');
  const res = await fetch(`${BASE}${path}`, { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': HOST, accept: 'application/json' } });
  if (!res.ok) {
    const details = await res.text().catch(() => '');
    throw new Error(details.includes('does not exist') ? `SportAPI does not currently expose ${path}. Its schedule endpoint returned 404.` : `SportAPI returned ${res.status}. Check your RapidAPI subscription and key.`);
  }
  return res.json();
}
const score = (v: any) => v?.current ?? v?.normaltime ?? v?.display ?? '–';
const statusLabel = (m: Match) => m.status?.description || m.status?.type || (m.startTimestamp ? new Date(m.startTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Scheduled');
const localDate = (timestamp: number) => { const d = new Date(timestamp * 1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const POPULAR_LEAGUES = ['uefa champions league','premier league','laliga','la liga','serie a','bundesliga','ligue 1','uefa europa league','uefa conference league','championship','eredivisie','primeira liga','major league soccer','mls','saudi pro league'];
const leagueName = (match: Match) => match.tournament?.uniqueTournament?.name || match.tournament?.name || 'Other competitions';
const leagueRank = (name: string) => {
  const normalized = name.toLowerCase();
  const index = POPULAR_LEAGUES.findIndex(league => normalized === league || normalized.includes(league));
  return index < 0 ? POPULAR_LEAGUES.length : index;
};

async function fetchDailyMatches(force = false): Promise<Match[]> {
  const date = today();
  if (!force && scheduleCache[date]) return scheduleCache[date];
  const responses = await Promise.allSettled(TODAY_CATEGORIES.map(id => api(`/category/${id}/scheduled-events/${date}`)));
  const successful = responses.filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled');
  if (!successful.length) throw new Error('Could not load today’s leagues. Check your connection and RapidAPI access.');
  const unique = new Map<number, Match>();
  for (const result of successful) for (const event of unwrap(result.value)) {
    if (event.id && event.startTimestamp && localDate(event.startTimestamp) === date) unique.set(event.id, event);
  }
  const matches = [...unique.values()];
  scheduleCache[date] = matches;
  return matches;
}

function MatchCard({ match, onPress, saved, onToggleSaved }: { match: Match; onPress: () => void; saved: boolean; onToggleSaved: () => void }) {
  const live = ['inprogress', 'live', '1st half', '2nd half'].includes(String(match.status?.type || '').toLowerCase());
  return <Pressable style={s.matchCard} onPress={onPress}>
    <View style={s.matchMeta}><Text style={s.league}>{match.tournament?.name || match.tournament?.uniqueTournament?.name || 'Football'}</Text><View style={s.matchState}>{live && <View style={s.liveDot}/>}<Text style={[s.stateText, live && s.liveText]}>{statusLabel(match)}</Text></View></View>
    <View style={s.teams}><View style={s.teamCol}><Text style={s.teamName} numberOfLines={1}>{match.homeTeam?.name || 'Home'}</Text><Text style={s.teamSub}>{match.homeTeam?.shortName || ''}</Text></View><View style={s.scoreCol}><Text style={s.score}>{score(match.homeScore)} <Text style={s.scoreDivider}>:</Text> {score(match.awayScore)}</Text><Text style={s.period}>{match.status?.description || 'FULL TIME'}</Text></View><View style={[s.teamCol,s.away]}><Text style={s.teamName} numberOfLines={1}>{match.awayTeam?.name || 'Away'}</Text><Text style={s.teamSub}>{match.awayTeam?.shortName || ''}</Text></View><Pressable hitSlop={10} style={{width:26,alignItems:'flex-end',justifyContent:'center'}} onPress={(event) => { event.stopPropagation(); onToggleSaved(); }}><Ionicons name={saved ? 'star' : 'star-outline'} size={19} color={saved ? '#e7a72e' : '#9aa69f'}/></Pressable></View>
  </Pressable>;
}

export default function App() {
  const [tab, setTab] = useState<'Live'|'Today'|'Scores'|'Saved'|'Bet'>('Live');
  const [matches, setMatches] = useState<Match[]>([]); const [savedMatches, setSavedMatches] = useState<Match[]>([]); const [savedLoaded, setSavedLoaded] = useState(false); const [refreshing, setRefreshing] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [selected, setSelected] = useState<Match|null>(null);
  const [picks, setPicks] = useState<MatchPick[]>([]); const [picksLoaded, setPicksLoaded] = useState(false);
  useEffect(() => { AsyncStorage.getItem(SAVED_KEY).then(value => { if (value) setSavedMatches(JSON.parse(value)); }).catch(() => {}).finally(() => setSavedLoaded(true)); }, []);
  useEffect(() => { if (savedLoaded) AsyncStorage.setItem(SAVED_KEY, JSON.stringify(savedMatches)).catch(() => {}); }, [savedMatches, savedLoaded]);
  useEffect(() => { AsyncStorage.getItem(PICKS_KEY).then(value => { if (value) setPicks(JSON.parse(value)); }).catch(() => {}).finally(() => setPicksLoaded(true)); }, []);
  useEffect(() => { if (picksLoaded) AsyncStorage.setItem(PICKS_KEY, JSON.stringify(picks)).catch(() => {}); }, [picks, picksLoaded]);
  const toggleSaved = useCallback((match: Match) => {
    setSavedMatches(current => current.some(item => item.id === match.id) ? current.filter(item => item.id !== match.id) : [match, ...current]);
  }, []);
  const placePick = useCallback((match: Match, outcome: PickOutcome, points: number) => {
    setPicks(current => [{eventId: match.id, match, outcome, points, createdAt: Date.now()}, ...current.filter(pick => pick.eventId !== match.id)]);
  }, []);
  const fetchMatches = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true); setError('');
    try {
      if (tab === 'Saved') { if (savedLoaded) setMatches(savedMatches); return; }
      if (tab === 'Live') { const data = await api('/sport/football/events/live'); setMatches(unwrap(data)); }
      else setMatches(await fetchDailyMatches(refresh));
    }
    catch (e: any) { setError(e.message || 'Unable to load matches.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tab, savedMatches, savedLoaded]);
  useEffect(() => { fetchMatches(); }, [fetchMatches]);
  useEffect(() => { if (tab === 'Live') { const timer = setInterval(() => fetchMatches(true), 30000); return () => clearInterval(timer); } }, [tab, fetchMatches]);
  const title = tab === 'Live' ? 'Live scores' : tab === 'Today' ? 'Today’s matches' : tab === 'Scores' ? 'Today’s results' : tab === 'Bet' ? 'Betting picks' : 'Saved matches';
  const visibleMatches = useMemo(() => tab === 'Scores' ? matches.filter(m => ['finished','ended','after extra time','after penalties'].includes(String(m.status?.type || '').toLowerCase())) : matches, [matches, tab]);
  const sections = useMemo(() => {
    const grouped = new Map<string, Match[]>();
    for (const match of visibleMatches) {
      const name = leagueName(match);
      grouped.set(name, [...(grouped.get(name) || []), match]);
    }
    return [...grouped.entries()]
      .sort(([nameA, matchesA], [nameB, matchesB]) => leagueRank(nameA) - leagueRank(nameB) || (Number(matchesB[0]?.tournament?.priority || 0) - Number(matchesA[0]?.tournament?.priority || 0)) || nameA.localeCompare(nameB))
      .map(([title, data]) => ({ title, data: data.sort((a,b) => (a.startTimestamp||0) - (b.startTimestamp||0)) }));
  }, [visibleMatches]);
  const showDetail = (m: Match) => setSelected(m);
  return <SafeAreaView style={s.safe} edges={['top']}><StatusBar barStyle="dark-content" backgroundColor="#f5f7f6"/>
    <View style={s.topbar}><View><Text style={s.brand}>MATCHDAY<Text style={s.brandDot}>.</Text></Text><Text style={s.date}>{new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</Text></View><Pressable style={s.profile}><Ionicons name="person-outline" size={19} color="#12231d"/></Pressable></View>
    <View style={s.headingRow}><View><Text style={s.heading}>{selected ? 'Match centre' : title}</Text><Text style={s.subtitle}>{selected ? 'MATCH DETAILS' : tab === 'Live' ? `${matches.length} MATCHES IN PLAY` : tab === 'Today' || tab === 'Scores' ? 'TOP EUROPEAN LEAGUES' : tab === 'Bet' ? 'POINTS ONLY · NO CASH' : 'YOUR SAVED FIXTURES'}</Text></View><Pressable style={s.search} onPress={() => fetchMatches(true)}><Ionicons name="refresh" size={19} color="#163b2a"/></Pressable></View>
    {!selected && <View style={s.tabs}>{(['Live','Today','Scores','Saved','Bet'] as const).map((t) => <Pressable key={t} onPress={() => setTab(t)} style={[s.tab,t===tab&&s.tabActive]}><Ionicons name={t==='Bet'?'ticket-outline':'football-outline'} size={13} color={t===tab?'#163b2a':'#8a958f'}/><Text style={[s.tabText,t===tab&&s.tabTextActive]}>{t}</Text>{t==='Live'&&<View style={s.tabLive}/>}</Pressable>)}</View>}
    {selected ? <MatchDetail match={selected} back={() => setSelected(null)}/> : loading ? <View style={s.center}><ActivityIndicator color="#0e8a57" size="large"/><Text style={s.emptyNote}>Finding the latest scores…</Text></View> : error ? <View style={s.center}><Ionicons name="cloud-offline-outline" size={38} color="#97a49e"/><Text style={s.emptyTitle}>Can’t load the scores</Text><Text style={s.emptyNote}>{error}</Text><Pressable style={s.retry} onPress={() => fetchMatches()}><Text style={s.retryText}>Try again</Text></Pressable></View> : tab === 'Bet' ? <BettingScreen matches={matches} picks={picks} picksLoaded={picksLoaded} onPlacePick={placePick}/> : <SectionList sections={sections} keyExtractor={(item,index)=>String(item.id||index)} contentContainerStyle={s.list} stickySectionHeadersEnabled={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>fetchMatches(true)} tintColor="#0e8a57"/>} renderSectionHeader={({section})=><Text style={{fontSize:11,fontWeight:'800',letterSpacing:1,color:'#7a8981',textTransform:'uppercase',marginTop:7,marginBottom:10,marginLeft:3}}>{section.title}</Text>} renderItem={({item})=><MatchCard match={item} onPress={()=>showDetail(item)} saved={savedMatches.some(saved=>saved.id===item.id)} onToggleSaved={()=>toggleSaved(item)}/>} ListEmptyComponent={<View style={s.center}><Ionicons name={tab==='Saved'?'star-outline':'football-outline'} size={42} color="#aeb8b3"/><Text style={s.emptyTitle}>{tab==='Live'?'No live matches right now':tab==='Saved'?'No saved matches yet':tab==='Scores'?'No finished matches available':'No matches scheduled today'}</Text><Text style={s.emptyNote}>{tab==='Saved'?'Tap the star on any match to save it here.':'Pull down to check for updates.'}</Text></View>}/>}
  </SafeAreaView>;
}

function BettingScreen({matches,picks,picksLoaded,onPlacePick}:{matches:Match[];picks:MatchPick[];picksLoaded:boolean;onPlacePick:(match:Match,outcome:PickOutcome,points:number)=>void}) {
  const [view,setView]=useState<'Explore'|'My picks'>('Explore');
  const [selections,setSelections]=useState<Record<number,PickOutcome>>({});
  const [stake,setStake]=useState(10);
  const isFinished=(match:Match)=>['finished','ended','after extra time','after penalties'].includes(String(match.status?.type||'').toLowerCase());
  return <ScrollView contentContainerStyle={{paddingHorizontal:18,paddingBottom:28}}>
    <View style={{backgroundColor:'#123d2c',borderRadius:20,padding:18,marginBottom:17}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{width:38,height:38,borderRadius:13,backgroundColor:'#215a40',alignItems:'center',justifyContent:'center'}}><Ionicons name="ticket" size={20} color="#b9f27c"/></View><View><Text style={{fontSize:16,fontWeight:'800',color:'#fff'}}>Matchday picks</Text><Text style={{fontSize:11,color:'#c4d4ca',marginTop:3}}>Make a call. Play with points.</Text></View></View>
      <Text style={{fontSize:11,color:'#deebe3',lineHeight:17,marginTop:13}}>Choose a match outcome and stake free points. Picks are saved on this device; there are no cash deposits or payouts.</Text>
    </View>
    <View style={{flexDirection:'row',backgroundColor:'#e9eeeb',borderRadius:13,padding:4,marginBottom:14}}>{(['Explore','My picks'] as const).map(item=><Pressable key={item} onPress={()=>setView(item)} style={{flex:1,alignItems:'center',paddingVertical:9,borderRadius:10,backgroundColor:view===item?'#fff':'transparent'}}><Text style={{fontSize:12,fontWeight:'700',color:view===item?'#163b2a':'#8a958f'}}>{item}{item==='My picks'?` (${picks.length})`:''}</Text></Pressable>)}</View>
    {!picksLoaded ? <ActivityIndicator style={{marginTop:35}} color="#0e8a57"/> : view==='My picks' ? picks.length ? picks.map(pick=><View key={pick.eventId} style={{backgroundColor:'#fff',borderRadius:16,padding:15,marginBottom:11,borderWidth:1,borderColor:'#edf1ee'}}><Text style={{fontSize:10,fontWeight:'700',color:'#84918a'}}>{leagueName(pick.match).toUpperCase()}</Text><Text style={{fontSize:14,fontWeight:'700',color:'#193126',marginTop:8}}>{pick.match.homeTeam?.name} vs {pick.match.awayTeam?.name}</Text><Text style={{fontSize:12,color:'#0b8a56',fontWeight:'700',marginTop:6}}>Your pick: {pick.outcome==='home'?pick.match.homeTeam?.name:pick.outcome==='away'?pick.match.awayTeam?.name:'Draw'} · {pick.points} points</Text><Text style={{fontSize:10,color:'#98a39d',marginTop:4}}>{statusLabel(pick.match)}</Text></View>) : <View style={{alignItems:'center',paddingVertical:42}}><Ionicons name="ticket-outline" size={38} color="#aeb8b3"/><Text style={{fontSize:15,fontWeight:'700',color:'#34463c',marginTop:13}}>No picks yet</Text><Text style={{fontSize:12,color:'#929c96',marginTop:5}}>Choose a match in Explore to make your first pick.</Text></View> : matches.length ? matches.filter(match=>!isFinished(match)).map(match=>{
      const selection=selections[match.id]; const existing=picks.find(pick=>pick.eventId===match.id);
      const choices:[PickOutcome,string][]=[['home',match.homeTeam?.shortName||match.homeTeam?.name||'Home'],['draw','Draw'],['away',match.awayTeam?.shortName||match.awayTeam?.name||'Away']];
      return <View key={match.id} style={{backgroundColor:'#fff',borderRadius:17,padding:15,marginBottom:11,borderWidth:1,borderColor:'#edf1ee'}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text numberOfLines={1} style={{fontSize:10,fontWeight:'700',color:'#78867e',maxWidth:'72%'}}>{leagueName(match)}</Text><Text style={{fontSize:10,color:'#929c96'}}>{statusLabel(match)}</Text></View>
        <Text style={{fontSize:14,fontWeight:'700',color:'#193126',marginTop:12}}>{match.homeTeam?.name} <Text style={{fontSize:11,color:'#98a39d'}}>vs</Text> {match.awayTeam?.name}</Text>
        <View style={{flexDirection:'row',gap:7,marginTop:13}}>{choices.map(([value,label])=><Pressable key={value} onPress={()=>setSelections(current=>({...current,[match.id]:value}))} style={{flex:1,minHeight:40,alignItems:'center',justifyContent:'center',paddingHorizontal:4,borderRadius:10,borderWidth:1,borderColor:selection===value?'#0b8a56':'#e5ebe7',backgroundColor:selection===value?'#eaf6ef':'#fff'}}><Text numberOfLines={1} style={{fontSize:10,fontWeight:'700',color:selection===value?'#0b8a56':'#66746c'}}>{label}</Text></Pressable>)}</View>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:13}}><View style={{flexDirection:'row',gap:6,alignItems:'center'}}><Text style={{fontSize:10,color:'#8a958f',marginRight:2}}>Stake</Text>{[10,25,50].map(value=><Pressable key={value} onPress={()=>setStake(value)} style={{paddingHorizontal:9,paddingVertical:6,borderRadius:8,backgroundColor:stake===value?'#eaf6ef':'#f3f5f4'}}><Text style={{fontSize:10,fontWeight:'700',color:stake===value?'#0b8a56':'#77837c'}}>{value}</Text></Pressable>)}</View><Pressable disabled={!selection} onPress={()=>selection&&onPlacePick(match,selection,stake)} style={{paddingHorizontal:13,paddingVertical:9,borderRadius:10,backgroundColor:selection?'#0b8a56':'#dce5df',opacity:selection?1:.7}}><Text style={{fontSize:10,fontWeight:'800',color:selection?'#fff':'#829089'}}>{existing?'Update pick':'Place pick'}</Text></Pressable></View>
        {existing&&<Text style={{fontSize:10,color:'#0b8a56',marginTop:8}}>Saved pick: {existing.outcome==='home'?match.homeTeam?.shortName||match.homeTeam?.name:existing.outcome==='away'?match.awayTeam?.shortName||match.awayTeam?.name:'Draw'} · {existing.points} points</Text>}
      </View>;
    }) : <View style={{alignItems:'center',paddingVertical:42}}><Ionicons name="football-outline" size={38} color="#aeb8b3"/><Text style={{fontSize:15,fontWeight:'700',color:'#34463c',marginTop:13}}>No matches available to pick</Text><Text style={{fontSize:12,color:'#929c96',marginTop:5}}>Check back when today’s fixtures are listed.</Text></View>}
  </ScrollView>;
}

function MatchDetail({match,back}:{match:Match;back:()=>void}) {
  const [data,setData]=useState<AnyObj>({}); const [busy,setBusy]=useState(true);
  useEffect(()=>{let active=true; Promise.allSettled([api(`/event/${match.id}`),api(`/event/${match.id}/incidents`),api(`/event/${match.id}/statistics`)]).then(r=>{if(active)setData({event:r[0].status==='fulfilled'?r[0].value:{},incidents:r[1].status==='fulfilled'?unwrap(r[1].value):[],stats:r[2].status==='fulfilled'?unwrap(r[2].value):[]});}).finally(()=>active&&setBusy(false)); return()=>{active=false};},[match.id]);
  return <ScrollView contentContainerStyle={s.detail}><Pressable onPress={back} style={s.back}><Ionicons name="arrow-back" size={19} color="#153b2b"/><Text style={s.backText}>All matches</Text></Pressable><Text style={s.detailLeague}>{match.tournament?.name||'Football'} · {statusLabel(match)}</Text><View style={s.heroScore}><View style={s.heroTeam}><Text style={s.heroName}>{match.homeTeam?.name}</Text></View><Text style={s.heroNumber}>{score(match.homeScore)} : {score(match.awayScore)}</Text><View style={s.heroTeam}><Text style={s.heroName}>{match.awayTeam?.name}</Text></View></View>{busy?<ActivityIndicator color="#0e8a57"/>:<><Text style={s.sectionTitle}>MATCH TIMELINE</Text>{data.incidents.length?data.incidents.map((x:AnyObj,i:number)=><View style={s.incident} key={i}><Text style={s.incidentMin}>{x.time ? `${x.time}′` : '•'}</Text><Text style={s.incidentText}>{(x.incidentType||x.type||'Match event')}{x.player?.name?` · ${x.player.name}`:x.text?` · ${x.text}`:''}</Text></View>):<Text style={s.emptyNote}>No incidents available yet.</Text>}<Text style={s.sectionTitle}>MATCH STATISTICS</Text>{data.stats.length?data.stats.slice(0,8).map((x:AnyObj,i:number)=><View style={s.statRow} key={i}><Text style={s.statValue}>{x.home||x.homeValue||'—'}</Text><Text style={s.statName}>{x.name||x.title||'Statistic'}</Text><Text style={s.statValue}>{x.away||x.awayValue||'—'}</Text></View>):<Text style={s.emptyNote}>Statistics are not available for this match.</Text>}</>}</ScrollView>
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#f5f7f6'},topbar:{paddingHorizontal:22,paddingTop:8,paddingBottom:21,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{fontSize:19,fontWeight:'900',letterSpacing:2.3,color:'#102d21'},brandDot:{color:'#13a66a'},date:{marginTop:4,color:'#829089',fontSize:12,fontWeight:'500'},profile:{height:40,width:40,borderRadius:14,backgroundColor:'#e9efeb',alignItems:'center',justifyContent:'center'},headingRow:{paddingHorizontal:22,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},heading:{fontSize:27,fontWeight:'800',color:'#12251c',letterSpacing:-.7},subtitle:{marginTop:5,color:'#8b9791',fontSize:10,fontWeight:'800',letterSpacing:1.4},search:{width:40,height:40,borderRadius:13,backgroundColor:'#eaf1ed',alignItems:'center',justifyContent:'center'},tabs:{flexDirection:'row',marginHorizontal:22,marginTop:22,marginBottom:16,backgroundColor:'#e9eeeb',padding:4,borderRadius:14},tab:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5,paddingVertical:10,borderRadius:11},tabActive:{backgroundColor:'#fff',shadowColor:'#123',shadowOpacity:.07,shadowRadius:5,elevation:2},tabText:{fontSize:12,fontWeight:'700',color:'#8a958f'},tabTextActive:{color:'#163b2a'},tabLive:{height:6,width:6,borderRadius:3,backgroundColor:'#eb5961'},list:{paddingHorizontal:18,paddingBottom:16,flexGrow:1},matchCard:{backgroundColor:'#fff',borderRadius:18,paddingHorizontal:16,paddingVertical:15,marginBottom:12,borderWidth:1,borderColor:'#edf1ee'},matchMeta:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingBottom:13,borderBottomWidth:1,borderBottomColor:'#f0f3f1'},league:{fontSize:11,color:'#6e7c75',fontWeight:'700',maxWidth:'68%'},matchState:{flexDirection:'row',alignItems:'center',gap:5},liveDot:{width:6,height:6,borderRadius:3,backgroundColor:'#ee525b'},stateText:{fontSize:10,color:'#929b96',fontWeight:'600'},liveText:{color:'#e34f58'},teams:{flexDirection:'row',alignItems:'center',paddingTop:14},teamCol:{flex:1},away:{alignItems:'flex-end'},teamName:{fontSize:14,fontWeight:'700',color:'#193126'},teamSub:{fontSize:10,color:'#a1aaa5',marginTop:3},scoreCol:{alignItems:'center',minWidth:92},score:{fontSize:23,fontWeight:'800',letterSpacing:1,color:'#153526'},scoreDivider:{color:'#abb5af',fontWeight:'400'},period:{fontSize:9,color:'#99a39e',fontWeight:'700',marginTop:3,letterSpacing:.7},center:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:34,paddingBottom:50},emptyTitle:{fontSize:16,fontWeight:'700',color:'#34463c',marginTop:15,textAlign:'center'},emptyNote:{fontSize:12,color:'#929c96',marginTop:8,textAlign:'center',lineHeight:18},retry:{marginTop:16,backgroundColor:'#0e8a57',paddingHorizontal:22,paddingVertical:10,borderRadius:11},retryText:{color:'#fff',fontSize:12,fontWeight:'700'},bottom:{backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#edf0ee',paddingTop:11,paddingBottom:5,flexDirection:'row',justifyContent:'space-around'},bottomItem:{alignItems:'center',gap:3,minWidth:60},bottomText:{fontSize:9,fontWeight:'600',color:'#929c97'},bottomActive:{fontSize:9,fontWeight:'700',color:'#0b8a56'},detail:{paddingHorizontal:22,paddingBottom:38},back:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:11},backText:{fontSize:13,fontWeight:'700',color:'#153b2b'},detailLeague:{textAlign:'center',fontSize:12,color:'#8a958f',fontWeight:'700',marginTop:12},heroScore:{marginTop:24,backgroundColor:'#fff',borderRadius:20,padding:20,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#edf1ee'},heroTeam:{flex:1,alignItems:'center'},heroName:{fontSize:13,fontWeight:'700',textAlign:'center',color:'#193126'},heroNumber:{fontSize:25,fontWeight:'900',color:'#153526',paddingHorizontal:8},sectionTitle:{fontSize:10,letterSpacing:1.5,fontWeight:'800',color:'#8b9791',marginTop:27,marginBottom:13},incident:{flexDirection:'row',paddingVertical:11,borderBottomWidth:1,borderBottomColor:'#e9eeeb',gap:18},incidentMin:{width:34,color:'#0d8b57',fontWeight:'800',fontSize:12},incidentText:{fontSize:13,color:'#384a40',fontWeight:'600',flex:1},statRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#e9eeeb'},statValue:{fontSize:13,fontWeight:'700',color:'#284034',width:44},statName:{fontSize:12,color:'#7b8981',textAlign:'center',flex:1},
});
