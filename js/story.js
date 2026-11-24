/* =========================================================
   Story, dialogue & the 21 endings  (G = cutscene API from game.js)
   ========================================================= */
const MOM_NAME = 'Emily Carter';
const MOM_YEARS = '1986 – 2024';

const ENDINGS = {
  1: { name: 'Good Ending?...', sub: 'Something is missing', phase: 1, hint: 'Clean the house... but something is missing' },
  2: { name: 'Good Ending', sub: 'A perfect day... without her', phase: 1, hint: 'Clean house + a good cake on the table' },
  3: { name: 'Bad Ending', sub: 'Disappointment', phase: 1, hint: 'Less than 50% clean' },
  4: { name: 'Forget Ending', sub: 'Lost in distractions', phase: 1, hint: 'Play the Game Boy instead of cleaning' },
  5: { name: 'Insanity Ending', sub: 'The breaking point', phase: 1, hint: 'Get the Bad Ending 10 times' },
  6: { name: 'Sad Ending', sub: 'Some actions can\'t be undone', phase: 1, hint: 'After the Insanity Ending' },
  7: { name: 'Wrong Day Ending', sub: 'Task failed successfully', phase: 1, hint: '2% chance on the Good Ending' },
  8: { name: 'Homeless Ending', sub: 'Ashes to ashes', phase: 1, hint: 'Let the cake burn' },
  9: { name: 'Is This Real? Ending', sub: 'Questioning reality', phase: 2, hint: '≤2 pieces, no cleaning, no cake' },
  10: { name: 'Bad Ending 2', sub: 'Unwanted memories', phase: 2, hint: 'Find 3–10 photo pieces' },
  11: { name: 'Mom Ending', sub: 'Her smile remains', phase: 2, hint: 'Find piece #6 — her face' },
  12: { name: 'Wait What? Ending', sub: 'Choosing to forget', phase: 2, hint: 'Throw the pieces away' },
  13: { name: 'Almost There Ending', sub: 'Out of time', phase: 2, hint: '11 pieces, but time runs out' },
  14: { name: 'Burned Ending', sub: 'Ashes to ashes', phase: 2, hint: 'Examine the pieces by the fireplace (30%)' },
  15: { name: 'REPLACEMENT ENDING', sub: 'We lost her twice', phase: 2, hint: '11 pieces + draw her face', star: 1 },
  16: { name: 'MEMORY ENDING', sub: 'She comes back to us', phase: 2, hint: 'All 12 pieces, hang it on the roof', star: 2 },
  17: { name: 'The Hoarder Ending', sub: 'Hoarding grief', phase: 2, hint: 'Hide 8–10 pieces in your room' },
  18: { name: 'The Clumsy Ending', sub: 'Careless mistakes', phase: 2, hint: 'Run while carrying 10+ pieces' },
  19: { name: 'The Distraction Ending', sub: 'Giving up too easily', phase: 2, hint: 'Play the Game Boy in Phase 2' },
  20: { name: 'The Intruder Ending', sub: 'Broken trust', phase: 2, hint: 'Break into Dad\'s office' },
  21: { name: 'The Confession Ending', sub: 'Broken, but together', phase: 2, hint: '11 pieces, talk honestly with Dad', star: 1 },
};

const Story = {
  async intro(G) {
    G.mood('sad');
    G.look([12.95, 1.0, 1.6], [14.3, 1.55, 2.2]);
    G.dad({ x: 14.4, z: 2.2, rot: -Math.PI / 2 - 0.25 });
    await G.fade(false, 1500);
    await G.say('Dad', '(shaking you) Wake up.');
    await G.say('You', 'Dad? What time is it...?');
    await G.say('Dad', "It's 3 AM. Today is our wedding anniversary.");
    await G.say('You', 'I know—');
    await G.say('Dad', "The house is a mess. Your mother... she'd want it clean. She always kept everything perfect.");
    await G.narr('(A pause. His voice cracks.)');
    await G.say('Dad', 'I need you to do something. Clean the house. Make it how it used to be.');
    G.dad({ x: 13.25, z: 2.25, rot: -2.8, sit: true }); G.look([12.85, 1.0, 0.55], [13.25, 1.15, 2.2]);
    await G.say('Dad', "The cleaning stuff is in the storage room, end of the hallway. Trash goes in the bins out back.");
    G.sfx('door'); G.hideDad();
    await G.wait(500);
    await G.think("He's been so sad lately... I need to help him.");
    return await G.choose("It's 3:00 AM.", ['Go back to sleep until 6 AM', 'Get up and start early']);
  },

  async earlyTalk(G) {
    const i = await G.choose('Dad is on the couch, looking through old photos.', ['Dad, how long has Mom been gone?', 'Are you okay?', 'Tell me about Mom', 'Never mind']);
    if (i === 0) { await G.say('Dad', "...A long time, kiddo. She's on a... long business trip."); await G.say('Dad', "She'll come back. Someday."); await G.think("He didn't look at me when he said that."); }
    else if (i === 1) { await G.say('Dad', "I'm fine. Just... tired."); await G.say('Dad', '(hides the photo) Go on, do your thing.'); }
    else if (i === 2) {
      await G.say('Dad', 'Your mother... had the most beautiful smile. When she smiled, the whole house lit up.');
      await G.say('Dad', 'She used to sing while she cooked. Terribly off-key.');
      await G.narr('(He laughs a little, then goes quiet for a long time.)');
      await G.say('Dad', 'She always baked her strawberry cake on our anniversary. The recipe must still be somewhere in the kitchen.');
    }
  },
  async dadLeaves(G) {
    G.sfx('door'); await G.wait(400); G.sfx('car');
    G.notify('🚗 Dad left for work. Clean the house before 5 PM!');
  },

  recipeText: `<div class="recipe">
    <h2>Mom's Famous Strawberry Cake ♡</h2>
    <ul><li>2 cups flour</li><li>1 cup sugar</li><li>3 eggs</li><li>½ cup butter</li>
    <li>1 cup milk</li><li>1 tsp vanilla</li><li>Lots of fresh strawberries!</li></ul>
    <p>Bake for 30 minutes. <b>Don't overbake!</b></p>
    <p class="sign">The secret is love ♡ — Mom</p></div>`,

  async medicine(G) {
    await G.narr('Behind the mirror there are old prescription bottles. The name on the labels is... Mom\'s.');
    await G.narr(`"${MOM_NAME} — Pain relief. Chemotherapy support: as directed." Dated more than two years ago.`);
    await G.think("Cancer medicine? Mom was sick? Why did nobody tell me?");
    await G.think("...I'm overthinking it.");
  },
  async frames(G) { await G.think('All the family photos on the wall... are turned face-down. Who would do that?'); },
  async bedDivide(G) {
    await G.think("Dad's side is a mess of bottles and tissues. Mom's side is perfectly made... and covered in dust.");
    await G.think('Like nobody has touched it in years.');
  },
  async momStand(G) {
    await G.think("Mom's reading glasses. Her book, bookmark still at chapter seven.");
    await G.think("Everything on her side... frozen in time.");
  },

  async phase2Piece(G) {
    G.sfx('chime');
    await G.narr('A photo piece... it appeared from nowhere.');
    await G.narr('It shows a small hand holding a larger hand.');
    await G.think("This is... a family photo? But why is it here?");
    await G.think('The wind is blowing in the backyard. Like it\'s calling me.');
  },
  async grave(G) {
    G.mood('none');
    await G.narr('You wipe the dirt and vines off the stone.');
    await G.overlay(`<div class="grave"><div class="stone"><div class="gphoto">☺</div>
      <h2>${MOM_NAME}</h2><p>Beloved Wife &amp; Mother</p><p>${MOM_YEARS}</p>
      <p class="ep">"Forever in our hearts"</p><p>Rest with the angels</p></div></div>`, 'Touch the stone');
    G.sfx('heart'); await G.wait(500); G.sfx('heart');
    await G.narr('(EVERYTHING COMES RUSHING BACK)');
    G.tint('flash'); G.sfx('whoosh');
    await G.narr('— Hospital room, two years ago —');
    await G.say('Young you', 'Mommy, when are you coming home?');
    await G.say('Mom', '(weak) Soon, sweetie. Very soon.');
    await G.narr('(She is crying, holding your hand.)');
    await G.say('Mom', 'I need you to promise me something...');
    await G.say('Young you', 'What?');
    await G.say('Mom', "Take care of Daddy for me. He's going to be very sad.");
    await G.say('Young you', "Why would he be sad if you're coming home?");
    await G.narr("(She can't answer. She just hugs you tight.)");
    G.sfx('whoosh');
    await G.narr('— The funeral —');
    await G.say('Young you', "Where's Mommy?");
    await G.say('Dad', '(crying, holding you) She... she went away, buddy.');
    await G.say('Young you', 'On a trip?');
    await G.say('Aunt', "(whispering to Dad) You can't lie to him forever.");
    await G.say('Dad', "(harsh whisper) Watch me. He's too young to understand death.");
    G.sfx('whoosh');
    await G.narr('— One year ago —');
    await G.narr('(Dad, drunk, throwing pictures into the fireplace.)');
    await G.say('Young you', 'Dad! Stop! Those are our pictures!');
    await G.say('Dad', "Looking at her HURTS! I can't... I can't do this anymore!");
    await G.say('Dad', "Listen to me. Your mother is just on a long trip. A business trip. She'll come back someday. Say it!");
    await G.say('Young you', "(scared, crying) She's... on a trip...");
    await G.say('Dad', "Good. Good boy. We'll wait for her together.");
    G.tint(null); G.sfx('thud');
    await G.say('You', "She's dead. Mom has been dead for two years.");
    await G.say('You', 'And Dad... Dad made me forget. Made me believe the lie.');
    await G.say('You', 'The photo. I need to find the rest of the photo. To remember her. To really remember her face.');
  },

  async arrive(G, early) {
    G.sfx('car'); await G.wait(1800); G.sfx('door');
    G.placePlayerForArrival();
    G.dad({ x: 2.5, z: 19.2, rot: Math.PI });
    await G.fade(false, 600);
    await G.say('Dad', early ? '...' : "I'm home...");
  },

  // ================= ENDINGS =================
  async e1(G, s) {
    await Story.arrive(G);
    if (s.clean >= 0.9) await G.say('Dad', 'You... you cleaned everything. The house looks just like how she used to keep it.');
    else await G.say('Dad', 'You cleaned up quite a bit. The place feels... easier to breathe in.');
    await G.narr('(Dad runs his hand along a clean surface, quiet for a moment.)');
    G.dad({ x: 8.3, z: 13.75, rot: Math.PI, sit: true }); G.look([8.3, 1.4, 11.2], [8.3, 1.0, 13.75]);
    await G.say('Dad', 'Thank you, kiddo. I know you worked hard.');
    await G.say('Dad', "It's just... (he looks around the room) it feels like something's missing.");
    await G.narr("(He doesn't say what. You both sit in silence.)");
  },
  async e2(G, s) {
    await Story.arrive(G);
    await G.say('Dad', "I'm ho—");
    await G.narr('(He freezes. The house is spotless. A cake with candles waits on the dining table.)');
    await G.say('Dad', '(voice breaking) You... you did all this?');
    await G.say('You', "I found Mom's recipe. I made her cake.");
    if (s.cakeMsg) await G.narr(`(Written on the cake in icing: "${s.cakeMsg}")`);
    await G.say('Dad', 'Her handwriting...');
    await G.narr('(He sits down, puts his head in his hands, and cries.)');
    await G.say('Dad', "It's perfect. Everything is perfect. Just like she made it.");
    await G.say('You', 'Dad...?');
    await G.say('Dad', 'She would be so proud of you. Thank you. Thank you so much.');
    await G.say('Dad', "Let's... let's eat together. For her.");
    await G.narr('(You eat cake in silence, both crying quietly.)');
  },
  async e3(G) {
    G.mood('tense');
    await Story.arrive(G);
    await G.narr('(He looks around. Bottles everywhere. Dishes piled in the sink.)');
    await G.say('Dad', 'What... what is this?');
    await G.say('You', 'I tried, Dad, but—');
    await G.say('Dad', '(angry) You had ALL DAY! I asked you to do ONE THING!');
    await G.say('You', "I'm sorry!");
    await G.say('Dad', "Your mother kept this place PERFECT and you can't even clean up for ONE DAY?!");
    await G.narr('(He grabs a bottle and drops into a chair.)');
    await G.say('Dad', "Just... just go to your room. I can't look at you right now.");
  },
  async e4(G) {
    await Story.arrive(G);
    await G.narr("(The house is still a mess. You're sitting there with the Game Boy.)");
    await G.say('Dad', '...Are you serious?');
    await G.say('You', 'Dad, I—');
    await G.say('Dad', 'I asked you to clean. And you played games all day?');
    await G.narr("(He doesn't yell. He just looks... defeated.)");
    await G.say('Dad', 'I should have known better.');
    G.sfx('door'); G.hideDad();
    await G.narr('(He walks to his room and closes the door.)');
  },
  async e5(G) {
    G.mood('tense'); G.tint('red');
    await G.narr('(Your room, late at night. Dad yelled again.)');
    await G.think('He always yells. Always drinks. Always blames me.');
    await G.think("The smell of alcohol... his angry voice... I can't take it anymore.");
    await G.think('That coil of wire in the hallway closet... if he tripped when he came home drunk...');
    const i = await G.choose('A dark thought...', ['Set a trap', 'No. Go to sleep.']);
    G.tint(null);
    return i === 0;
  },
  async e6(G) {
    G.mood('tense');
    await Story.arrive(G);
    await G.narr('(Dad heads down the hallway, tired from work.)');
    G.dad({ x: 6.9, z: 8.25, rot: Math.PI / 2 });
    G.look([10.5, 1.5, 8.25], [7.2, 0.9, 8.25]);
    await G.wait(600); G.sfx('heart');
    await G.narr("(SLOW MOTION — Dad's foot catches the wire.)");
    const helped = await G.qte('GRAB DAD!', 5);
    if (helped) {
      G.sfx('thud');
      await G.narr("(You rush forward and grab his arm. You both fall, but his head doesn't hit the floor.)");
      await G.say('Dad', '(panting) What... what was that?');
      await G.narr('(He sees the wire. Then he looks at you. And he understands.)');
      await G.say('Dad', 'You... you tried to...');
      await G.say('Dad', 'YOU TRIED TO KILL ME?!');
      await G.say('You', 'Dad, I—');
      await G.narr('(His face turns from confusion, to fear, to rage.)');
      await G.fade(true, 300); G.sfx('thud'); await G.wait(1500);
      return 'Self Defense';
    }
    G.sfx('thud'); await G.fade(true, 200); await G.wait(1200);
    await G.narr('(Silence.)');
    await G.say('You', '...Dad?');
    await G.say('You', 'Dad?!');
    await G.narr('(No response.)');
    await G.say('You', 'Oh god. Oh god, what did I do.');
    await G.narr('(Sirens in the distance. The neighbours heard the noise.)');
    return 'Manslaughter';
  },
  async e7(G) {
    await Story.arrive(G);
    await G.say('Dad', 'Wow, the house looks amazing! And you made the cake!');
    await G.say('You', 'Happy anniversary, Dad!');
    await G.say('Dad', 'Anniversary...?');
    await G.narr('(He walks over to the calendar on the wall.)');
    await G.say('Dad', 'Oh... oh no.');
    await G.say('You', 'What?');
    await G.say('Dad', "Today isn't our anniversary. That's next week.");
    await G.narr('(Long silence.)');
    await G.say('You', '...What?');
    await G.say('Dad', "I'm so sorry. I got the date wrong. I've been so stressed and—");
    await G.narr('(You stare at each other. Then you start laughing. Then Dad starts laughing. You laugh until you cry.)');
    await G.say('Dad', 'Well... the house looks great anyway!');
  },
  async e8(G) {
    G.mood('tense');
    await G.narr('(The flames spread to the curtains, the cabinets. Thick black smoke everywhere.)');
    await G.say('You', 'FIRE! OH NO, FIRE!');
    await G.narr('(You run outside and watch the house burn from the yard. The fire trucks arrive — too late.)');
    G.sfx('car'); await G.wait(1500);
    await G.say('Dad', '(getting out of the car, horrified) WHAT HAPPENED?!');
    await G.say('You', "(crying) I'm sorry! The cake burned and I didn't—");
    await G.narr('(Dad looks at the burning house. Everything he had left of her. Photos, clothes, memories.)');
    await G.say('Dad', '(quietly) Our home... our memories...');
    await G.narr('(You both watch it burn.)');
  },
  async e9(G) {
    await G.narr('(You sit in your room holding two small photo pieces.)');
    await G.think('This is from... the beach trip. I remember that day.');
    await G.think('Or do I? Did it really happen?');
    await G.think("She's really gone. But these pieces... are these memories real? Or am I going crazy?");
    await Story.arrive(G);
    await G.say('Dad', 'What are you doing?');
    await G.say('You', 'Is this real, Dad? Any of this?');
    await G.say('Dad', '...');
    await G.say('Dad', "I don't know anymore, kid. I really don't.");
    await G.narr('(You both sit in silence, uncertain.)');
  },
  async e10(G) {
    G.mood('tense');
    await Story.arrive(G);
    await G.say('Dad', "What's all this?");
    await G.say('You', 'I found pieces of the family photo. The one you tore up.');
    await G.say('Dad', '(stiffens) Where did you find those?');
    await G.say('You', 'All over the house. While I was supposed to be cleaning.');
    await G.say('Dad', 'So instead of cleaning... you spent all day looking for these?');
    await G.say('You', 'I wanted to put it back together. To remember—');
    await G.say('Dad', 'STOP.');
    G.sfx('paper');
    await G.narr('(He sweeps the pieces onto the floor.)');
    await G.say('Dad', 'I tore that photo up for a REASON!');
    await G.say('Dad', 'Some things should stay broken!');
    G.sfx('door'); G.hideDad();
    await G.narr('(You pick the pieces up off the floor, one by one.)');
  },
  async e11(G) {
    await G.say('You', 'I found it. I found her face.');
    await G.think('I remember this smile. She smiled like this when she tucked me in at night.');
    await Story.arrive(G);
    await G.say('Dad', 'Is that...');
    await G.say('You', 'I found her face. From the photo.');
    await G.narr('(He walks over slowly. Tears start falling.)');
    await G.say('Dad', "I've tried so hard to forget this smile. But I can't.");
    await G.say('Dad', "Even just this piece... it's enough to break me.");
    await G.say('You', "Don't you want to remember her?");
    await G.say('Dad', 'Remembering hurts too much, kiddo.');
    await G.narr('(You both cry, holding the single piece.)');
  },
  async e12(G) {
    await Story.arrive(G);
    await G.say('Dad', 'You did good today. Thanks.');
    await G.say('You', 'Yeah...');
    await G.think("I don't tell him about the pieces.");
    await G.narr('(He never knows you found them — and threw them away.)');
    await G.narr('(And you both go on living the lie.)');
  },
  async e13(G) {
    await G.say('You', 'No no no, I need more time!');
    G.sfx('car'); await G.wait(1200);
    await G.say('You', 'NO! Just a little longer!');
    G.sfx('door'); G.placePlayerForArrival(); G.dad({ x: 2.5, z: 19.2, rot: Math.PI });
    await G.fade(false, 500);
    await G.say('Dad', "I'm home!");
    await G.narr('(You hide the pieces quickly. The drawing is unfinished.)');
    await G.say('Dad', 'What are you doing?');
    await G.say('You', 'Nothing! I just—');
    await G.say('Dad', 'Were you... working on something?');
    await G.say('You', 'I was so close...');
  },
  async e14(G) {
    G.mood('none');
    await G.say('You', '(screaming) NO NO NO!');
    await G.narr('(The pieces burn in your hands. Only ashes remain.)');
    await G.fade(true, 800);
    await G.narr('(Hours later...)');
    G.sfx('car'); await G.wait(1200); G.sfx('door');
    G.look([1.8, 1.0, 12.8], [0.4, 0.4, 12.8]);
    G.dad({ x: 2.3, z: 11.5, rot: -Math.PI / 2 - 0.5 });
    await G.fade(false, 600);
    await G.say('Dad', 'What happened?!');
    await G.say('You', 'The photo... I found the pieces... they burned...');
    await G.narr('(You show him the ashes.)');
    await G.say('Dad', '...');
    await G.narr('(He sits down next to you.)');
    await G.say('Dad', "Maybe that's how it should be. Ashes. Like her.");
  },
  async e15(G) {
    await Story.arrive(G);
    G.dad({ x: 14.5, z: 16.4, rot: Math.PI }); G.look([14.5, 1.5, 12.6], [14.5, 1.1, 16.3]);
    await G.say('You', 'Dad... I found the photo pieces. Almost all of them.');
    await G.showPhoto(true);
    await G.say('You', "I couldn't find your— her face. I tried to draw it but... I can't remember what Mom looked like.");
    await G.narr('(Dad takes the photo and looks at the crude crayon face.)');
    await G.narr('(His expression crumbles completely.)');
    await G.say('Dad', 'You... you forgot her face?');
    await G.say('You', "I'm sorry, I tried to—");
    await G.say('Dad', 'I forgot too.');
    await G.say('You', 'What?');
    await G.say('Dad', "(crying) I can't remember her face either. Not clearly. It's been two years and I... I forgot.");
    await G.say('Dad', 'We lost her twice. Once when she died... and again when we forgot what she looked like.');
    await G.say('Dad', "I'm sorry I lied to you. About her death. I thought... I thought I was protecting you.");
    await G.say('You', 'I know, Dad.');
    await G.say('Dad', 'But we both ended up forgetting her anyway.');
    await G.narr('(You sit in silence, mourning not just her death — but the fading of her memory.)');
  },
  async e16(G) {
    // Adapted version: nobody dies; the child survives the fall.
    G.mood('warm');
    await G.say('You', 'I did it, Mom. I hung it back up.');
    await G.narr("(The evening light hits the photo — Mom's face is glowing.)");
    await G.say('You', "It's beautiful...");
    G.sfx('thud');
    await G.narr('(SUDDENLY — the boxes beneath you shift.)');
    await G.narr('(You lose your balance and fall backward toward the roof edge...)');
    await G.think('Oh...');
    await G.think('At least... at least I finished it.');
    G.sfx('whoosh'); await G.fade(true, 300); G.tint('white'); await G.fade(false, 900);
    await G.narr('— A sunny day at the beach —');
    await G.say('Mom', '(laughing) Catch it, sweetie!');
    await G.narr('(You catch the beach ball and throw it to Dad.)');
    await G.say('Dad', '(smiling — truly happy) Nice throw!');
    await G.narr('(Mom picks you up and spins you around.)');
    await G.say('Young you', '(giggling) Again! Again!');
    await G.narr('(She sets you down and kneels to your level.)');
    await G.say('Mom', 'Remember this moment, okay? Remember how happy we are.');
    await G.say('Young you', 'I will, Mommy!');
    await G.say('Mom', 'Good. Because no matter what happens... we\'ll always have this.');
    await G.say('Mom', "And you have to live a long, happy life for me. Promise?");
    await G.narr('(She kisses your forehead.)');
    await G.fade(true, 1200); G.tint(null);
    await G.narr('— 5:00 PM —');
    G.sfx('car'); await G.wait(1500);
    await G.narr('(Dad comes home and finds you lying still beneath the roof.)');
    await G.say('Dad', 'No... NO! Please wake up! PLEASE!');
    await G.narr('(Sirens. He never lets go of your hand.)');
    await G.wait(800);
    await G.narr('— The hospital, that night —');
    await G.narr('(You open your eyes. Your arm is in a cast. Dad is beside the bed, eyes red, holding the photo — all 12 pieces, taped together.)');
    await G.say('Dad', "You're awake... thank God...");
    await G.say('Dad', 'I saw the photo on the roof. You found every piece. Even the one in my wallet.');
    await G.say('Dad', "I'm sorry. I'm so sorry I lied to you. I'm sorry I made you forget her.");
    await G.say('Dad', 'I almost lost you too... because I was too scared to tell the truth.');
    await G.say('You', 'I dreamed about Mom, Dad. At the beach. She told me to live a happy life.');
    await G.narr('(Dad breaks down and holds you tight.)');
    await G.say('Dad', "From now on we remember her together. No more lies.");
    await G.say('Dad', "When you're better... let's hang it in the living room. Where the morning sun hits first. Like she liked.");
    await G.narr('(A week later, the photo goes up. For the first time in two years, the house has light in it.)');
    await G.overlay(`<div class="memnote">"Thank you for remembering me.<br>Now live happily — both of you.<br><span>— Mom</span>"</div>`, 'Continue');
  },
  async e17(G) {
    await G.think("These are mine. My memories of her. I won't let Dad destroy them again.");
    await Story.arrive(G);
    await G.say('Dad', 'How was your day?');
    await G.say('You', 'Fine. Cleaned a bit.');
    await G.narr("(Dad doesn't know about the pieces.)");
    await G.fade(true, 800);
    await G.narr('(That night, you take out the pieces and look at them under the lamp.)');
    await G.say('You', 'My treasures. My memories.');
    await G.narr('(Never shown to anyone. Never completed. Just fragments, hoarded.)');
  },
  async e18(G) {
    await G.narr('(You step on several pieces. CRUNCH — they tear into even smaller scraps.)');
    await G.say('You', 'What have I done?!');
    await G.narr("(They're destroyed beyond repair.)");
    await G.fade(true, 800); await G.narr('(Hours later...)');
    await Story.arrive(G);
    await G.say('Dad', 'What happened?');
    await G.say('You', 'I destroyed them... I destroyed her memory...');
  },
  async e19(G) {
    await Story.arrive(G);
    await G.narr("(You're still playing. Only a few pieces found.)");
    await G.say('Dad', 'Did you... did you spend all day gaming again?');
    await G.say('You', 'I found some pieces but—');
    await G.say('Dad', 'But you got distracted.');
    await G.say('Dad', 'You were so close to something meaningful. And you gave up for a game.');
    G.sfx('door'); G.hideDad();
  },
  async e20(G) {
    G.mood('tense');
    await G.say('You', "What? He's early!");
    G.sfx('door');
    G.dad({ x: 19.15, z: 8.4, rot: Math.PI }); G.look([19.2, 1.4, 4.0], [19.15, 1.4, 8.4]);
    await G.say('Dad', 'WHAT THE HELL?!');
    await G.say('Dad', 'You BROKE into my office?!');
    await G.say('You', 'I was looking for photo pieces—');
    await G.say('Dad', "I DON'T CARE! This is MY private space!");
    await G.narr('(He grabs your arm, drags you out, and locks the door again.)');
    G.sfx('door');
    await G.say('You', 'Dad, please—');
    await G.say('Dad', "(through the door) I can't even trust you anymore.");
  },
  async e21(G) {
    G.mood('warm');
    await Story.arrive(G);
    G.dad({ x: 14.5, z: 16.42, rot: Math.PI, sit: true }); G.look([14.5, 1.4, 12.6], [14.5, 1.0, 16.3]);
    await G.say('You', 'Dad, can you sit down? I need to show you something.');
    await G.say('Dad', '(voice catching) The photo...');
    await G.showPhoto(false);
    await G.say('You', "I found all these pieces while cleaning. But I can't find her face. Piece 6 is missing.");
    await G.say('You', 'Do you... do you still remember what she looked like?');
    await G.say('Dad', 'Her face? I...');
    await G.narr('(Long silence.)');
    await G.say('Dad', 'No. Not clearly. Not anymore.');
    await G.say('You', 'Me neither.');
    await G.say('You', 'Dad... why did you tell me she was on a trip?');
    await G.say('Dad', "Because I couldn't say the words. 'Your mom is dead.' I couldn't... I couldn't make it real.");
    await G.say('You', 'I found her grave. Today. In the backyard.');
    await G.narr('(Dad starts crying.)');
    await G.say('Dad', "I'm so sorry. I'm sorry I lied. I'm sorry I made you forget.");
    await G.say('You', 'I know why you did it. You were trying to protect me.');
    await G.say('You', "But we don't need to protect each other from the truth anymore.");
    await G.narr('(He pulls you into a hug. You both cry for a long time.)');
    await G.say('Dad', 'I miss her so much.');
    await G.say('You', 'Me too.');
    await G.say('You', "We can't remember her face clearly. But we remember her love.");
    await G.say('Dad', "Yeah... yeah, you're right.");
    await G.say('Dad', "You know what? This is okay. It doesn't need to be complete.");
    await G.say('Dad', "The photo is broken. Our family is broken. But we're still here. Still together.");
    await G.say('Dad', "Let's keep these. As they are. They're more honest this way.");
    await G.say('Dad', 'Thank you. For remembering her. For trying.');
    await G.say('You', 'Thanks for finally telling me the truth.');
  },
};
