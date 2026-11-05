/* P15.7: accurate, readable, localized license explanations.
 * Static content is bundled with the original offline BAS, not Cloudflare.
 */
(()=>{
'use strict';
const guides={
pt:{
 intro:'A licença explica o que outras pessoas poderão fazer com a sua animação após baixá-la. Pense especialmente em cópias, modificações, créditos e uso comercial.',
 entries:[
 ['CC0 1.0 — Domínio público','Você abre mão dos direitos autorais, na medida permitida pela lei. Qualquer pessoa poderá copiar, modificar, redistribuir ou até usar comercialmente sua animação, sem pedir autorização. Não é obrigatório dar créditos, embora isso seja uma boa prática.','Escolha se quiser que todo mundo reutilize sua criação livremente.'],
 ['CC BY 4.0 — Atribuição','Outras pessoas poderão compartilhar, modificar e usar comercialmente sua animação, mas deverão citar você como autor, indicar a licença e informar se fizeram mudanças. Não podem sugerir que você apoia o uso delas.','Uma boa opção para espalhar sua criação e manter o reconhecimento da autoria.'],
 ['CC BY-SA 4.0 — Atribuição e CompartilhaIgual','Permite cópias, modificações e até uso comercial, como a CC BY. A diferença é que quem publicar uma versão modificada deverá dar créditos e distribuir essa adaptação sob a mesma licença ou uma compatível.','Boa escolha se quiser que os remixes continuem igualmente livres para todos.'],
 ['Todos os direitos reservados','Você não dá permissão geral para outras pessoas republicarem, distribuírem ou modificarem sua animação. Estar na galeria não torna o arquivo livre para qualquer uso. É possível visualizar e baixar pelo BAS conforme as permissões aplicáveis, mas outros usos exigem autorização sua ou uma exceção legal.','Ideal se preferir controlar a distribuição e as versões modificadas.']
 ],
 note:'Importante: só licencie conteúdo sobre o qual você tem os direitos necessários, inclusive músicas e imagens de terceiros. As licenças Creative Commons corretamente concedidas em geral não podem ser retiradas de quem cumpre as condições. CC0 é uma dedicação ao domínio público, não uma licença CC comum.'
},
en:{
 intro:'A license tells people what they may do with your animation after downloading it. Consider copying, editing, crediting and commercial reuse.',
 entries:[
 ['CC0 1.0 — Public domain dedication','You waive copyright rights to the extent the law allows. Anyone may copy, modify, redistribute or even use your animation commercially, without asking permission. Credit is not mandatory, but is a thoughtful practice.','Choose this if you want your creation to be reused as freely as possible.'],
 ['CC BY 4.0 — Attribution','Others may share, modify and commercially use your animation, but must credit you, identify the license and indicate changes. They may not imply that you endorse their use.','Good if you want wide sharing while retaining recognition as the creator.'],
 ['CC BY-SA 4.0 — Attribution-ShareAlike','People may copy, adapt and use your animation commercially, like CC BY. The difference: anyone who shares an adapted version must credit you and release that adaptation under the same or a compatible license.','Good when you want remixes to stay just as shareable as the original.'],
 ['All rights reserved','You do not give broad permission to republish, redistribute or modify your animation. A BAS gallery listing does not make the file free for any purpose. Viewing and downloading through BAS follow applicable permissions, while broader uses require your approval or a legal exception.','Choose this if you want control over redistribution and adaptations.']
 ],
 note:'Important: only license content you have the right to share, including third-party music and images. Valid Creative Commons licenses are generally irrevocable for people following their conditions. CC0 is a public-domain dedication, not an ordinary CC license.'
},
es:{
 intro:'La licencia explica qué pueden hacer otras personas con tu animación: copiarla, modificarla, atribuirte la autoría o utilizarla comercialmente.',
 entries:[
 ['CC0 1.0 — Dominio público','Renuncias a tus derechos de autor hasta donde la ley lo permita. Cualquiera podrá copiar, modificar, redistribuir y usar comercialmente tu animación sin pedir permiso. No se exige atribución, aunque dar crédito es recomendable.','Ideal si quieres que todos puedan reutilizar tu creación libremente.'],
 ['CC BY 4.0 — Atribución','Permite compartir, modificar y utilizar comercialmente la animación. Los usuarios deben darte crédito, mencionar la licencia e indicar cualquier cambio, sin sugerir que tú apoyas su uso.','Para difundir ampliamente la obra manteniendo el reconocimiento.'],
 ['CC BY-SA 4.0 — Atribución-CompartirIgual','Permite compartir, modificar y usar comercialmente, como CC BY. Quien publique una adaptación deberá darte crédito y distribuirla con la misma licencia o una compatible.','Para mantener libres también las versiones modificadas.'],
 ['Todos los derechos reservados','No das permiso general para republicar, redistribuir ni modificar tu animación. Publicarla en BAS no la hace libre para cualquier finalidad. Los visitantes pueden verla y descargarla según los permisos aplicables; otros usos requieren tu permiso o una excepción legal.','Si prefieres conservar el control sobre redistribución y remixes.']
 ],
 note:'Importante: comparte solo obras para las que tengas derechos, incluidos música e imágenes. Una licencia Creative Commons válida normalmente no se puede retirar a quien cumple sus condiciones. CC0 es una dedicación al dominio público.'
},
fr:{
 intro:'La licence indique ce que les autres peuvent faire avec votre animation après téléchargement : copies, modifications, attribution et usage commercial.',
 entries:[
 ['CC0 1.0 — Domaine public','Vous renoncez aux droits d’auteur dans les limites de la loi. Toute personne peut copier, modifier, redistribuer et utiliser commercialement votre animation sans demander la permission. L’attribution n’est pas obligatoire, mais reste appréciée.','Pour permettre une réutilisation aussi libre que possible.'],
 ['CC BY 4.0 — Attribution','Le partage, les adaptations et l’usage commercial sont autorisés. Les utilisateurs doivent vous citer, indiquer la licence et signaler les changements, sans laisser croire que vous approuvez leur utilisation.','Pour diffuser largement votre travail tout en étant reconnu.'],
 ['CC BY-SA 4.0 — Attribution-Partage dans les mêmes conditions','Comme CC BY, cette licence permet le partage, les adaptations et l’usage commercial. Toute adaptation partagée doit vous créditer et être publiée sous la même licence ou une licence compatible.','Pour que les versions modifiées restent aussi libres que l’original.'],
 ['Tous droits réservés','Vous n’accordez pas une autorisation générale de modifier, republier ou redistribuer votre animation. La présence dans BAS ne rend pas la création libre de droits. Les consultations et téléchargements suivent les autorisations applicables ; d’autres usages nécessitent votre accord ou une exception légale.','Pour conserver le contrôle sur les redistributions et les remixes.']
 ],
 note:'Important : assurez-vous de disposer des droits sur tous les éléments, dont images et musique. Les licences Creative Commons valides sont généralement irrévocables pour ceux qui respectent leurs conditions. CC0 est une renonciation au droit d’auteur.'
},
de:{
 intro:'Die Lizenz legt fest, was andere nach dem Herunterladen mit deiner Animation machen dürfen: Kopieren, Bearbeiten, Namensnennung und kommerzielle Nutzung.',
 entries:[
 ['CC0 1.0 — Gemeinfreiheit','Du verzichtest soweit gesetzlich möglich auf Urheberrechte an deiner Animation. Andere dürfen sie ohne Erlaubnis kopieren, verändern, weitergeben und kommerziell nutzen. Eine Namensnennung ist nicht vorgeschrieben, aber eine gute Praxis.','Wenn du eine möglichst uneingeschränkte Weiterverwendung möchtest.'],
 ['CC BY 4.0 — Namensnennung','Teilen, Bearbeiten und kommerzielle Verwendung sind erlaubt. Dabei müssen andere dich als Urheber nennen, die Lizenz angeben und auf Änderungen hinweisen. Sie dürfen keine Unterstützung durch dich vortäuschen.','Für breite Verbreitung mit Anerkennung deiner Urheberschaft.'],
 ['CC BY-SA 4.0 — Namensnennung-Weitergabe unter gleichen Bedingungen','Wie CC BY erlaubt diese Lizenz Teilen, Bearbeiten und kommerzielle Nutzung. Wer eine Bearbeitung veröffentlicht, muss dich nennen und sie unter derselben oder einer kompatiblen Lizenz weitergeben.','Wenn auch Remixe für andere frei nutzbar bleiben sollen.'],
 ['Alle Rechte vorbehalten','Du erteilst keine allgemeine Erlaubnis zum Bearbeiten, erneuten Veröffentlichen oder Weiterverbreiten deiner Animation. Die Veröffentlichung in BAS macht sie nicht generell frei nutzbar. Ansehen und Herunterladen folgen den geltenden Berechtigungen; weitergehende Nutzungen brauchen eine Erlaubnis oder gesetzliche Ausnahme.','Wenn du Kontrolle über Remixe und Verbreitung behalten möchtest.']
 ],
 note:'Wichtig: Verwende nur Inhalte, an denen du die nötigen Rechte hast, darunter Musik und Bilder. Gültige Creative-Commons-Lizenzen sind für regelkonforme Nutzer grundsätzlich unwiderruflich. CC0 ist eine Gemeinfreiheitsfreigabe und keine gewöhnliche CC-Lizenz.'
},
it:{
 intro:'La licenza stabilisce cosa possono fare gli altri dopo aver scaricato la tua animazione: copiarla, modificarla, attribuirti la paternità o usarla commercialmente.',
 entries:[
 ['CC0 1.0 — Pubblico dominio','Rinunci ai diritti d’autore nella misura consentita dalla legge. Gli altri possono copiare, modificare, ridistribuire e usare commercialmente l’animazione senza chiedere il permesso. La citazione dell’autore non è obbligatoria, ma è consigliata.','Se vuoi permettere a tutti di riutilizzare liberamente l’opera.'],
 ['CC BY 4.0 — Attribuzione','Permette condivisione, modifiche e uso commerciale. Gli altri devono attribuirti la paternità, indicare la licenza e segnalare le modifiche, senza far credere che tu approvi il loro utilizzo.','Per diffondere l’opera mantenendo il riconoscimento.'],
 ['CC BY-SA 4.0 — Attribuzione-Condividi allo stesso modo','Come CC BY, consente condivisione, modifiche e uso commerciale. Chi pubblica una versione modificata deve attribuirti la paternità e usare la stessa licenza o una compatibile.','Se vuoi che i remix rimangano condivisibili liberamente.'],
 ['Tutti i diritti riservati','Non concedi un permesso generale di modificare, ripubblicare o ridistribuire l’animazione. Pubblicarla in BAS non autorizza ogni riutilizzo. La consultazione e il download tramite BAS seguono le autorizzazioni applicabili; altri usi richiedono permesso o un’eccezione legale.','Per mantenere il controllo sulla redistribuzione e sulle modifiche.']
 ],
 note:'Importante: scegli una licenza solo se possiedi i diritti necessari su tutti gli elementi, inclusi musica e immagini. Le licenze Creative Commons valide sono generalmente irrevocabili per chi ne rispetta le condizioni. CC0 è una dedica al pubblico dominio.'
},
ja:{
 intro:'ライセンスは、ダウンロード後にほかの人が作品をどう扱えるかを決めます。コピー・改変・作者表示・商用利用について確認しましょう。',
 entries:[
 ['CC0 1.0 — パブリックドメインへの提供','法律で認められる範囲で著作権を放棄します。ほかの人は許可を得ずにコピー、改変、再配布、商用利用ができます。作者表示は必須ではありませんが、表示することは望ましい慣習です。','誰もが自由に再利用できるようにしたい場合に適しています。'],
 ['CC BY 4.0 — 表示','作品の共有、改変、商用利用ができます。ただし利用者は作者を明記し、ライセンスを示し、変更があればその旨を記載する必要があります。作者が利用を支持しているように見せてはいけません。','広く利用してもらいつつ作者としてのクレジットを残したい場合に適しています。'],
 ['CC BY-SA 4.0 — 表示・継承','CC BYと同じく共有、改変、商用利用を認めます。ただし改変作品を公開する際は、原作者を表示し、同じまたは互換性のあるライセンスを適用する必要があります。','リミックスも同じように自由に共有してほしい場合に適しています。'],
 ['全著作権を留保','改変、再公開、再配布を広く許可するわけではありません。BASに投稿しただけで自由な再利用が認められるものではありません。BAS内での閲覧・ダウンロードは適用される許可に従い、その他の利用には許可または法律上の例外が必要です。','再配布やリミックスを自分で管理したい場合に適しています。']
 ],
 note:'重要：音楽や画像を含め、必要な権利を持つ素材のみ公開してください。適切に付与されたCreative Commonsライセンスは、条件を守る利用者には通常取り消せません。CC0は通常のCCライセンスではなく、パブリックドメインへの提供です。'
},
zh:{
 intro:'许可决定其他人在下载作品后可以做什么，例如复制、修改、署名和商业使用。选择前请了解不同许可的要求。',
 entries:[
 ['CC0 1.0 — 贡献至公共领域','在法律允许的范围内，你放弃作品的著作权。其他人无需取得许可便可复制、修改、再分发或商业使用。条款不强制要求署名，但注明作者仍是值得鼓励的做法。','适合希望任何人都能自由使用作品的创作者。'],
 ['CC BY 4.0 — 署名','允许分享、修改和商业使用你的作品。但使用者必须注明作者、提供许可信息并说明修改内容，而且不能暗示你认可他们的使用方式。','适合希望作品广泛传播，同时保留作者署名的情况。'],
 ['CC BY-SA 4.0 — 署名-相同方式共享','和CC BY一样允许分享、修改和商业使用。不过公开发布改编作品时，使用者必须署名，并为改编作品采用相同或兼容的许可。','适合希望所有二次创作也能自由分享的情况。'],
 ['保留所有权利','不授予他人修改、重新发布或再次分发作品的一般许可。在BAS发布不代表作品可被任意使用。用户可在适用权限内通过BAS浏览和下载；其他使用需要你的许可或法律规定的例外。','适合希望自行决定作品如何传播和修改的创作者。']
 ],
 note:'重要：请仅为自己拥有必要权利的内容选择许可，包括音乐、图片和第三方素材。有效的知识共享许可通常不能对遵守条款的使用者撤回。CC0是公共领域贡献工具，并非普通的CC许可。'
}
};
const urls=Object.freeze([
 'https://creativecommons.org/publicdomain/zero/1.0/',
 'https://creativecommons.org/licenses/by/4.0/',
 'https://creativecommons.org/licenses/by-sa/4.0/'
]);
window.BASCommunityLicenses=Object.freeze({
 supported:Object.freeze(Object.keys(guides)),
 forLanguage(lang){return guides[lang]||guides.en;},
 urls
});
})();
