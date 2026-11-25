import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Mesh} from 'three';
import {createMainSummitBlock,mainSummitLayout} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {createMainSummitIcefall} from '../tools/voxel-tavern/town-blockout/main-summit-icefall';
import {createMainSummitTrail} from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {createMainSummitSurveyStations} from '../tools/voxel-tavern/town-blockout/main-summit-survey-stations';
import {createSummitSurveyInscription} from '../tools/voxel-tavern/town-blockout/main-summit-survey-inscription';
import {createMainSummitHutFurnishings} from '../tools/voxel-tavern/town-blockout/main-summit-hut-furnishings';
import {surveyPlateLines} from '../tools/voxel-tavern/town-blockout/town-survey';

test('D4 M4-M7 production inscription reads all three B-window authority lines unchanged',t=>{
  for(const id of ['M4','M5','M6','M7']as const){
    const text=createSummitSurveyInscription(id);
    assert.deepEqual(text.lines,surveyPlateLines(id));
    assert.equal(text.lines.length,3);
    assert.ok(text.lines[0].includes(id));
    assert.ok(text.lines[1].startsWith('标尺 '));
    assert.ok(text.lines[2].startsWith('方位 '));
    assert.ok(text.pixelWidth>=512&&text.pixelHeight>=360);
    assert.equal(text.texture,undefined,'Node unit test has no DOM canvas; browser owns rendered texture');
  }
});

test('D4 M4-M6 have existing pillars while M7 engraves existing summit circle, no duplicate fourth post',t=>{
  const block=createMainSummitBlock(mainSummitLayout,347,100);
  const ice=createMainSummitIcefall(block.heightAt);
  t.after(()=>{ice.dispose();block.dispose()});
  const trail=createMainSummitTrail(block.heightAt,347);
  const survey=createMainSummitSurveyStations({
    cloudTerrace:{east:30,north:-30,height:347},
    trailPoints:trail.points,icefallTop:ice.topAnchor,
    heightAt:block.heightAt,
  });
  const hut=createMainSummitHutFurnishings();
  t.after(()=>{survey.dispose();hut.dispose()});
  assert.deepEqual(survey.stations.map(s=>s.id),['M4','M5','M6','M7']);
  assert.deepEqual(survey.stations.map(s=>s.plateLines),
    (['M4','M5','M6','M7']as const).map(surveyPlateLines));
  assert.deepEqual(survey.stations.map(s=>s.built),[true,true,true,false]);
  assert.equal(survey.group.children.length,3);
  assert.ok(hut.group.getObjectByName('survey-station-m7-marker'),
    'M7 must be on the existing stone-circle marker');
  assert.ok(hut.group.getObjectByName('survey-station-m7-inscription-foot'),
    'M7 has a low tablet in the same monument, not a new pillar');
  assert.deepEqual(hut.group.userData.surveyM7Lines,surveyPlateLines('M7'));
  assert.equal(hut.group.getObjectByName('survey-station-m7')?.parent,undefined,
    'do not quietly add a fourth duplicate survey column');
  assert.ok(hut.group.children.filter(x=>x.name.startsWith('survey-station-m7')).length===2);
  assert.equal(survey.blocked(survey.stations[0]!.east,survey.stations[0]!.north,347,.27,1.8),true);
});
