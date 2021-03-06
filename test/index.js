import { getSlippiGameDataFromBuffer } from '../src/index';

test('read settings', async () => {
  const game = getSlippiGameDataFromBuffer();
  const settings = game.getSettings();
  expect(settings.stageId).toBe(8);
  expect(_.first(settings.players).characterId).toBe(0x13);
  expect(_.last(settings.players).characterId).toBe(0xE);
});

test('test stats', () => {
  const game = new SlippiGame("test/test.slp");
  const stats = game.getStats();
  expect(stats.lastFrame).toBe(3694);

  // Test stocks
  // console.log(stats);
  expect(stats.stocks.length).toBe(5);
  expect(_.last(stats.stocks).endFrame).toBe(3694);

  // Test conversions
  // console.log(stats.events.punishes);
  expect(stats.conversions.length).toBe(10);
  const firstConversion = _.first(stats.conversions);
  expect(firstConversion.moves.length).toBe(4);
  expect(_.first(firstConversion.moves).moveId).toBe(15);
  expect(_.last(firstConversion.moves).moveId).toBe(17);

  // Test action counts
  expect(stats.actionCounts[0].wavedashCount).toBe(16);
  expect(stats.actionCounts[0].wavelandCount).toBe(1);
  expect(stats.actionCounts[0].airDodgeCount).toBe(3);

  // Test overall
  expect(stats.overall[0].inputCount).toBe(459);
});

test('test metadata', () => {
  const game = new SlippiGame("test/test.slp");
  const metadata = game.getMetadata();
  expect(metadata.startAt).toBe("2017-12-18T21:14:14Z");
  expect(metadata.playedOn).toBe("dolphin");
});

test('test incomplete', () => {
  const game = new SlippiGame("test/incomplete.slp");
  const settings = game.getSettings();
  expect(settings.players.length).toBe(2);
  game.getMetadata();
  game.getStats();
});

test('test nametags', () => {
  const game = new SlippiGame("test/nametags.slp");
  const settings = game.getSettings();
  expect(settings.players[0].nametag).toBe("AMNイ");
  expect(settings.players[1].nametag).toBe("");

  const game2 = new SlippiGame("test/nametags2.slp");
  const settings2 = game2.getSettings();
  expect(settings2.players[0].nametag).toBe("A1=$");
  expect(settings2.players[1].nametag).toBe("か、9@");

  const game3 = new SlippiGame("test/nametags3.slp");
  const settings3 = game3.getSettings();
  expect(settings3.players[0].nametag).toBe("B  R");
  expect(settings3.players[1].nametag).toBe(".  。");
});

test('test isPAL', () => {
  const palGame = new SlippiGame("test/pal.slp");
  const ntscGame = new SlippiGame("test/ntsc.slp");

  expect(palGame.getSettings().isPAL).toBe(true);
  expect(ntscGame.getSettings().isPAL).toBe(false);
});

test('test controllerFixes', () => {
  const game = new SlippiGame("test/controllerFixes.slp");
  const settings = game.getSettings();
  expect(settings.players[0].controllerFix).toBe("Dween");
  expect(settings.players[1].controllerFix).toBe("UCF");
  expect(settings.players[2].controllerFix).toBe("None");
});
