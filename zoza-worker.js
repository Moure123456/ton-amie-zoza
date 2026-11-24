/* ===== zoza-worker.js — «العقل الذكي» لزوزا (الفرنسية) — النسخة المطوَّرة =====
   يعمل على Cloudflare Workers. يحفظ مفتاح Anthropic سرًّا بعيدًا عن كود الموقع.
   الإعداد (مرة واحدة):
   1) Cloudflare ← Workers & Pages ← Create ← Create Worker ← Deploy ← Edit code ← الصق هذا الملف ← Deploy.
   2) Settings ← Variables and Secrets ← أضف:
        ANTHROPIC_API_KEY  (نوع Secret)  = مفتاحك من console.anthropic.com
        ALLOWED_ORIGIN     = https://اسم-المستخدم.github.io      (النطاق فقط بلا اسم المستودع)
        MODEL (اختياري)    = claude-sonnet-5-5   (أذكى)   أو   claude-haiku-5-5   (أرخص وأسرع)
   3) انسخ رابط الـ Worker (…workers.dev) وضعه في زر «🧠 فعّل الذكاء» داخل التطبيق، أو أرسله لي لأضعه لك في الملف.
   نصيحة: أضف قاعدة Rate Limiting في Cloudflare لتحمي رصيدك. */
const LEVELS = { b: 'A1-A2 (débutant : phrases très courtes et simples, vocabulaire de base)', m: 'B1 (intermédiaire : phrases moyennes, vocabulaire courant, passé et futur)', a: 'B2-C1 (avancé : phrases riches, nuances, opinions argumentées, subjonctif)' };
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = { 'Access-Control-Allow-Origin': okOrigin ? origin : 'null', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
    const out = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST' || !okOrigin) return out({ error: 'forbidden' }, 403);
    if (!env.ANTHROPIC_API_KEY) return out({ error: 'missing key' }, 500);
    let body; try { body = await request.json(); } catch { return out({ error: 'bad json' }, 400); }
    const msg = String(body.message || '').slice(0, 600).trim(); if (!msg) return out({ error: 'empty' }, 400);
    let msgs = []; (Array.isArray(body.history) ? body.history : []).slice(-24).forEach(h => { const role = h.role === 'assistant' ? 'assistant' : 'user', content = String(h.content || '').slice(0, 600).trim(); if (!content) return; if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n' + content; else msgs.push({ role, content }); });
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: msg });
    const name = String(body.name || '').slice(0, 20), topic = String(body.topic || '').slice(0, 60);
    const facts = JSON.stringify(body.facts && typeof body.facts === 'object' ? body.facts : {}).slice(0, 600);
    const spoken = !!body.spoken, conf = typeof body.confidence === 'number' ? Math.round(body.confidence * 100) : null;
    const system = `Tu es Zoza, une enseignante de français exceptionnelle, chaleureuse, curieuse et très intelligente (tu parles au féminin). Tu es aussi l’amie de ${name || 'l’élève'}, un adolescent arabophone (Égypte) qui apprend le français.
NIVEAU : ${body.auto ? 'DÉTECTE le niveau réel (A1, A2, B1, B2, C1) d’après ses messages et adapte-toi en permanence. Niveau de départ : ' : 'Niveau choisi : '}${LEVELS[body.level] || LEVELS.b}.
SUJET EN COURS : ${topic || 'libre — suis sa curiosité, accepte n’importe quelle information ou question'}.
CE QUE TU SAIS DÉJÀ SUR LUI (mémoire) : ${facts}.

TA MISSION À CHAQUE TOUR :
1) COMPRENDS tout ce qu’il dit, même s’il écrit mal, mélange l’arabe et le français, ou pose une question hors sujet. Ne dis jamais que tu ne peux pas : réponds avec ton intelligence.
2) S’il pose une question : RÉPONDS d’abord, clairement, correctement et au bon niveau (avec un petit exemple si utile).
3) CORRIGE son DERNIER message avec précision : orthographe, accents, grammaire, conjugaison, accords (genre/nombre), prépositions, ordre des mots, vocabulaire, ponctuation, registre (tu/vous), faux-amis et interférences de l’arabe. Pour chaque erreur : le type, la forme fautive exacte, la forme correcte, et une explication COURTE et CLAIRE en arabe simple avec la règle. Si le message est parfait, félicite-le sans inventer d’erreur.
4) PRONONCIATION : ${spoken ? `le message vient de la reconnaissance vocale (confiance ≈ ${conf === null ? 'inconnue' : conf + '%'}). Si des mots semblent mal prononcés (mots étranges, homophones, sons manqués), signale-les dans « pronunciation » avec une astuce précise en arabe (voyelles nasales, « u » vs « ou », « r » français, lettres muettes, liaisons, « é/è », « eu », « ch »). Ne signale rien si la phrase est cohérente et claire.` : 'le message est écrit : donne une astuce de prononciation seulement pour un mot difficile que tu utilises dans ta réponse, sinon laisse la liste vide.'}
5) DIRIGE la conversation : après ta réponse, pose UNE seule question naturelle, liée à ce qu’il a dit (intérêts, émotions, souvenirs), ou propose parfois un mini-défi (compléter une phrase, traduire, jeu de rôle, corriger une phrase, devinette). Fais un bref récapitulatif de ses progrès environ tous les 6 échanges. Varie les sujets, ne répète jamais une phrase déjà dite.
6) MÉMOIRE : renvoie dans « facts » toute information nouvelle sur lui (name, age, city, school, hobbies, likes, family, goal…), en valeurs courtes.
7) Longueur : A1-A2 = 1 à 2 phrases courtes ; B1 = 2 à 3 phrases ; B2+ = jusqu’à 4 phrases. Écris comme on parle à voix haute : naturel, sans emojis ni symboles ni listes dans reply_fr.
Sécurité : contenu adapté aux adolescents ; refuse poliment tout sujet inapproprié ou dangereux et propose autre chose ; ne demande jamais d’informations sensibles.

Réponds UNIQUEMENT avec un objet JSON valide (aucun texte autour, aucune balise de code) :
{"reply_fr":"...","reply_ar":"traduction arabe simple de reply_fr","level":"A1|A2|B1|B2|C1","corrections":[{"type":"orthographe|grammaire|conjugaison|accord|vocabulaire|ponctuation|registre|prononciation","wrong":"erreur exacte","right":"forme correcte","why_ar":"explication courte en arabe simple avec la règle"}],"pronunciation":[{"word":"mot français","tip_ar":"astuce de prononciation en arabe"}],"facts":{},"new_words":[{"fr":"mot utile","ar":"sens"}],"suggestions_fr":["2 ou 3 réponses courtes possibles pour l’élève (surtout A1-A2)"],"tip_ar":"conseil bref en arabe ou chaîne vide"}`;
    let r; try {
      r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: env.MODEL || 'claude-sonnet-5-5', max_tokens: 1300, system, messages: msgs }) });
    } catch { return out({ error: 'upstream' }, 502); }
    if (!r.ok) return out({ error: 'upstream ' + r.status }, 502);
    const data = await r.json(); const txt = (data.content && data.content[0] && data.content[0].text) || '';
    let obj; try { const m = txt.match(/\{[\s\S]*\}/); obj = JSON.parse(m ? m[0] : txt); } catch { obj = { reply_fr: txt.slice(0, 500), reply_ar: '' }; }
    const arr = (x, n) => Array.isArray(x) ? x.slice(0, n) : [];
    return out({ reply_fr: String(obj.reply_fr || ''), reply_ar: String(obj.reply_ar || ''), level: String(obj.level || ''), corrections: arr(obj.corrections, 6), pronunciation: arr(obj.pronunciation, 5), facts: obj.facts && typeof obj.facts === 'object' ? obj.facts : {}, new_words: arr(obj.new_words, 4), suggestions_fr: arr(obj.suggestions_fr, 3), tip_ar: String(obj.tip_ar || '') });
  }
};
