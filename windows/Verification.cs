using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;
namespace TemporalLoom
{
    internal static class Verification
    {
        internal static async Task Run(LoomWindow app, string[] args)
        {
            string target = args[Array.IndexOf(args, "--verify") + 1];
            var core = app.View.CoreWebView2;
            using (var log = new StreamWriter(Path.Combine(target, "windows-qa.txt")) { AutoFlush = true })
            {
                bool passed = false;
                try
                {
                    await Until(core, "typeof scrambleInstrument==='function' && typeof loadFragment==='function'", 12);
                    log.WriteLine("Shared interface loaded");
                    if (Array.IndexOf(args, "--mic-clip-only") >= 0)
                    {
                        await CheckRecordedMic(core, app, target);
                        log.WriteLine("PASS");
                        app.Close();
                        return;
                    }
                    if (Array.IndexOf(args, "--audio-response-only") >= 0)
                    {
                        await CheckMaximumAudioResponse(core);
                        log.WriteLine("Maximum audio response separated bass, mids and highs, detected attacks, settled after silence and preserved tempo sync. Native ASIO band processing passed with test samples.");
                        log.WriteLine("PASS");
                        app.Close();
                        return;
                    }
                    if (Array.IndexOf(args, "--camera-only") >= 0)
                    {
                        await CheckCamera(core);
                        log.WriteLine("Camera opened, captured a still and a clip, and supplied a live fragment. Stopping released both tracks and kept the still and clip in the deck.");
                        log.WriteLine("PASS");
                        app.Close();
                        return;
                    }
                    if (Array.IndexOf(args, "--performance-only") >= 0)
                    {
                        await CheckSeedTerms(core);
                        await CheckProgressiveSearch(core);
                        await CheckAbstractSearch(core, app, target);
                        log.WriteLine("Independent phrases, Google queue, progressive loading and Abstract search passed.");
                        await CheckTempoAndVideo(core, app, target);
                        log.WriteLine("Tempo timing, freeze, beginning and random video starts passed.");
                        await CheckOrganicMorphs(core, target);
                        log.WriteLine("All 30 distinct organic morphs rendered in WebGL and responded to phase, audio and seed.");
                        log.WriteLine("PASS");
                        app.Close();
                        return;
                    }
                    if (Array.IndexOf(args, "--media-only") >= 0)
                    {
                        await CheckMediaRanges(core, app, target);
                        log.WriteLine("Online size cap and bounded media responses passed. A 2.83 GB local file was served in chunks and a multi-chunk MP4 played, sought and looped.");
                    }
                    await CheckDeck(core, app, target);
                    log.WriteLine("Deck shuffle, mouse drag and keyboard reorder preserved active playback. Video frames changed with classic and organic rendering and resumed after Freeze.");
                    if (Array.IndexOf(args, "--deck-only") >= 0 || Array.IndexOf(args, "--media-only") >= 0)
                    {
                        log.WriteLine("PASS");
                        app.Close();
                        return;
                    }
                    await CheckType(core);
                    log.WriteLine("All bundled fonts loaded offline. Font browsing, import, editing and session round-trip passed");
                    await CheckMediaModes(core, app, target);
                    log.WriteLine("Photo, video and mixed searches filter before loading and preserve the selection in old and new sessions");
                    await CheckProgressiveSearch(core);
                    log.WriteLine("Fast providers and individual fragments appeared before slow requests. Cancel kept the ready deck.");
                    await CheckAbstractSearch(core, app, target);
                    log.WriteLine("Abstract search used bundled related terms after the exact search and stopped at the target");
                    await CheckRecordTriggers(core, app, target);
                    log.WriteLine("Immediate silent MP4, arm cancellation and mic trigger passed");
                    await CheckVideoAudio(core, app, target);
                    log.WriteLine("Direct and converted video soundtracks drove the analyzer and the converted track was recorded");
                    await CheckDetachedDisplay(core, app, target);
                    log.WriteLine("Detached display and controls work on separate monitors, with independent fullscreen, MP4 capture and reattachment");
                    await CheckNewEffects(core);
                    log.WriteLine("All new effect choices render distinct results, and the editable reset is 10–50");
                    await CheckWindowFragment(core);
                    log.WriteLine("A live video stream feeds the fragment deck and stops when released");
                    await CheckMicrophone(core);
                    log.WriteLine("Mic input enumeration, choice and live switching passed with simulated inputs");
                    await CheckAsio(core, log);
                    await CheckOrganicMorphs(core, target);
                    log.WriteLine("Organic morphs responded to phase, audio and seed changes");
                    await CheckRemoteVideo(core);
                    log.WriteLine("Videos mode searched Internet Archive and played a moving fragment");
                    await CheckCatalogs(core, log);
                    await CheckSliders(core);
                    log.WriteLine("Desktop sliders responded to mouse and keyboard, and effect tabs still switch");
                    await CheckLargeDeck(core);
                    log.WriteLine("512 fragments loaded with bounded previews and full-size active stills");
                    await core.ExecuteScriptAsync("setFragmentRange({min:2,max:2}); window.qaReady=false;" +
                        "collectFragments([{items:" + LoomWindow.Json(app.Sources.ReadFolder(Path.Combine(target, "media"))) + "}],++searchToken,chooseFragmentTarget()).then(r=>{assets=r.loaded;showAssets();qaReady=true;});");
                    await Until(core, "qaReady && assets.length===2 && assets.some(x=>x.kind==='video')", 18);
                    await Until(core, "assets.some(x=>x.kind==='video'&&videoPlayers.get(x)?.currentTime>.05)", 6);
                    await core.ExecuteScriptAsync("const before=$('effect').value;$('scramble').click();window.qaScramble=before!==$('effect').value;setStageFull(true)");
                    await Until(core, "qaScramble && $('stageWrap').classList.contains('expanded') && getComputedStyle(document.documentElement).overflow==='hidden' && getComputedStyle(document.documentElement).scrollbarWidth==='none'", 4);
                    await Task.Delay(350);
                    CheckNativeFullscreen(app);
                    await Until(core, "getComputedStyle($('overlayToggle')).display==='none' && getComputedStyle($('fullscreen').parentElement).visibility==='hidden' && getComputedStyle(canvas).cursor==='none'", 4);
                    await core.ExecuteScriptAsync("canvas.click()");
                    await Until(core, "getComputedStyle($('fullscreen').parentElement).visibility==='visible' && getComputedStyle($('caption')).display==='none'", 4);
                    await core.ExecuteScriptAsync("$('fullscreen').click()");
                    await Until(core, "getComputedStyle(document.documentElement).overflow!=='hidden'", 4);
                    await Task.Delay(250);
                    if (app.TopMost || app.FormBorderStyle == System.Windows.Forms.FormBorderStyle.None) throw new Exception("Windows window did not restore.");
                    log.WriteLine("Mixed folder import, video playback, Scramble and fullscreen passed");
                    using (var png = File.Create(Path.Combine(target, "temporal-loom.png")))
                        await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, png);
                    string wav = Convert.ToBase64String(File.ReadAllBytes(Path.Combine(target, "tone.wav")));
                    app.SetTestClip(Path.Combine(target, "temporal-loom-test.mp4"));
                    await core.ExecuteScriptAsync("fileAudio.src='data:audio/wav;base64," + wav + "';fileAudio.loop=true;$('driver').value='audio';$('driver').onchange();$('recordClip').click()");
                    await Until(core, "clipArmed && !clipRecorder", 5);
                    await core.ExecuteScriptAsync("ensureAudio().then(()=>fileAudio.play())");
                    await Until(core, "!fileAudio.paused && fileAudio.currentTime>0", 8);
                    await Until(core, "clipRecorder?.state==='recording'", 8);
                    await Task.Delay(1750);
                    await core.ExecuteScriptAsync("stopClip()");
                    await Until(core, "$('clipStatus').textContent==='Clip saved.'", 30);
                    log.WriteLine("Armed playback trigger, looping audio and MP4 capture passed");
                    await core.ExecuteScriptAsync("$('stopFile').click();setFragmentRange({min:2,max:2});$('words').value='New York architecture';$('source').value='wikipedia';$('excavate').click()");
                    await Until(core, "!$('excavate').disabled && assets.length===2 && assets.every(x=>x.source==='Wikipedia')", 45);
                    log.WriteLine("Wikipedia supplied two loaded fragments");
                    await core.ExecuteScriptAsync("$('source').value='google';setFragmentRange({min:1,max:1});$('excavate').click()");
                    await Until(core, "!$('excavate').disabled", 30);
                    log.WriteLine("Google outcome: " + await core.ExecuteScriptAsync("JSON.stringify(assets.map(x=>({source:x.source,title:x.title,link:x.link,image:x.image})))+' | '+$('status').textContent"));
                    await core.ExecuteScriptAsync("$('vfTab').click();$('pairButton').click()");
                    await Until(core, "!$('pairButton').disabled", 125);
                    log.WriteLine("Viewfinder outcome: " + await core.ExecuteScriptAsync("JSON.stringify({place:$('performanceTitle').textContent,images:assets.length,playing:!fileAudio.paused,status:$('pairStatus').textContent})"));
                    log.WriteLine("PASS");
                    passed = true;
                }
                catch (Exception error)
                {
                    log.WriteLine(error);
                }
                if (!passed) log.WriteLine(await core.ExecuteScriptAsync("JSON.stringify({status:$('status').textContent,clip:$('clipStatus').textContent,sources:assets.map(x=>x.source)})"));
                app.Close();
            }
        }
        private static async Task CheckRecordedMic(CoreWebView2 core, LoomWindow app, string target)
        {
            app.SetTestClip(Path.Combine(target, "mic-and-soundtrack.mp4"));
            await core.ExecuteScriptAsync(@"
                (async()=>{
                    const context=new AudioContext(),mix=context.createMediaStreamDestination(),mic=context.createMediaStreamDestination();
                    await context.resume();
                    for(const [hz,output] of [[440,mix],[1200,mic]]){
                        const tone=context.createOscillator(),gain=context.createGain();gain.gain.value=.13;tone.frequency.value=hz;
                        tone.connect(gain);gain.connect(output);tone.start();
                    }
                    window.qaMicContext=context;Mic.recordingStream=()=>mic.stream;
                    micState('Mic on');assignAudioMedia(null,mix.stream);await ensureAudio();await fileAudio.play();
                    $('recTrigger').value='immediate';$('recordClip').click();
                })();
            ");
            await Until(core, "clipRecorder?.state==='recording' && clipMicSource && $('clipStatus').textContent.includes('Mic included')", 10);
            await Task.Delay(1500);
            await core.ExecuteScriptAsync("$('recordClip').click()");
            await Until(core, "$('clipStatus').textContent==='Clip saved.' && !clipMicSource && !clipMicToken", 30);
            await core.ExecuteScriptAsync("assignAudioMedia(null);qaMicContext.close()");
        }
        private static async Task CheckMaximumAudioResponse(CoreWebView2 core)
        {
            const int length = 2048;
            var buffer = Marshal.AllocHGlobal(length * sizeof(float));
            try
            {
                var samples = new float[length];
                var tones = new[] { 70, 950, 6200 };
                for (int index = 0; index < tones.Length; index++)
                {
                    for (int i = 0; i < length; i++) samples[i] = (float)(.07 * Math.Sin(2 * Math.PI * tones[index] * i / 48000));
                    Marshal.Copy(samples, 0, buffer, length);
                    var meter = new AsioInput.BandMeter(48000);
                    AsioInput.BufferLevel(buffer, length, NAudio.Wave.Asio.AsioSampleType.Float32LSB, meter);
                    var bands = new[] { meter.Bass, meter.Mid, meter.High };
                    for (int other = 0; other < bands.Length; other++)
                        if (other != index && bands[index] <= bands[other] * 1.4) throw new Exception("Native bands did not separate test tones.");
                }
            }
            finally { Marshal.FreeHGlobal(buffer); }
            await core.ExecuteScriptAsync(@"
                (async()=>{
                    const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
                    const verify=(result,message)=>{if(!result)throw Error(message);};
                    const producer=new AudioContext();await producer.resume();
                    const sink=producer.createMediaStreamDestination(),tone=producer.createOscillator(),volume=producer.createGain();
                    volume.gain.value=.075;tone.frequency.value=70;tone.connect(volume);volume.connect(sink);tone.start();
                    try{
                        $('defaultFx').click();$('audioResponse').value='maximum';$('audioResponse').dispatchEvent(new Event('change'));
                        $('driver').value='audio';$('driver').onchange();
                        assignAudioMedia(null,sink.stream);await ensureAudio();await fileAudio.play();
                        restoreTempo({enabled:true,bpm:20,division:'1/4'});
                        const start=a;
                        await delay(195);
                        const low=fileSpectrum(analyser,audioContext.sampleRate);
                        verify(low.bass>low.mid*2&&low.bass>low.high*2,'Bass did not dominate');
                        tone.frequency.value=920;await delay(195);
                        const mid=fileSpectrum(analyser,audioContext.sampleRate);
                        verify(mid.mid>mid.bass*2&&mid.mid>mid.high*2,'Mids did not dominate');
                        tone.frequency.value=6200;await delay(195);
                        const high=fileSpectrum(analyser,audioContext.sampleRate);
                        verify(high.high>high.mid*2&&high.high>high.bass*2,'Highs did not dominate');
                        verify(a===start&&tempoSettings.enabled,'Audio displaced the tempo clock');
                        const response=makeMaximumMotion();
                        const silence={input:0,bass:0,mid:0,high:0};response('fixture',silence,.6,.016);
                        const strong=response('fixture',{input:.55,bass:.75,mid:.11,high:.08,peak:.7},.6,.016);
                        verify(strong.dynamic.onset&&strong.pulse>.3,'Strong attack was missed');
                        const second=response('fixture',{input:.7,bass:.81,mid:.3,high:.97},.6,.016);
                        verify(!second.dynamic.onset&&second.grainSpeed>strong.grainSpeed,'Highs did not increase grain motion or attack was duplicated');
                        let release=second;
                        for(let i=0;i<110;i++)release=response('fixture',silence,.6,.016);
                        verify(release.speed<.01&&release.pulse<.01,'Motion did not release into silence');
                        frozen=true;
                        const texture=demo(0),render=motion=>{
                          ctx.drawImage(texture,0,0,canvas.width,canvas.height);drawMaximumResponse(ctx,motion,2.1);return canvas.toDataURL();
                        };
                        verify(render(strong)!==render(second)&&render(strong)!==render(release),'Camera geometry did not change');
                        $('defaultFx').click();verify(audioResponse==='standard'&&analyser.fftSize===1024,'Default did not restore Standard');
                        window.qaMaximum=true;
                    }finally{
                        frozen=false;restoreTempo();assignAudioMedia(null);tone.stop();await producer.close();
                    }
                })().catch(error=>window.qaMaximum=error.message);
            ");
            await Until(core, "typeof window.qaMaximum!=='undefined'", 14);
            string outcome = await core.ExecuteScriptAsync("window.qaMaximum");
            if (outcome != "true") throw new Exception(outcome);
        }
        private static async Task CheckCamera(CoreWebView2 core)
        {
            await core.ExecuteScriptAsync("$('source').value='camera';$('source').onchange()");
            await Until(core, "!cameraPanel.hidden&&!$('excavate').disabled&&$('excavate').textContent==='Open camera'", 4);
            await core.CallDevToolsProtocolMethodAsync("Runtime.evaluate", LoomWindow.Json(new { expression = "$('excavate').click()", userGesture = true }));
            await Until(core, "cameraStream&&cameraStream.getAudioTracks().length===0&&cameraPreview.videoWidth>0&&!cameraStill.disabled", 12);
            await core.ExecuteScriptAsync("window.qaCameraTrack=cameraStream.getVideoTracks()[0];cameraStill.click()");
            await Until(core, "assets.length===1&&assets[0].title==='Camera still'&&assets[0].img.width>0", 6);
            await core.ExecuteScriptAsync("cameraLive.click()");
            await Until(core, "assets.length===2&&cameraLiveItem&&videoPlayers.get(cameraLiveItem)?.readyState>=2", 8);
            await core.ExecuteScriptAsync("window.qaLiveTrack=cameraLiveItem.liveStream.getVideoTracks()[0];cameraRecord.click()");
            await Until(core, "cameraRecording?.recorder.state==='recording'", 4);
            await Task.Delay(1300);
            await core.ExecuteScriptAsync("cameraRecord.click()");
            await Until(core, "assets.length===3&&assets.some(item=>item.title==='Camera clip'&&item.kind==='video'&&videoPlayers.get(item)?.currentTime>.05)", 10);
            await core.ExecuteScriptAsync("$('excavate').click()");
            await Until(core, "!cameraStream&&!cameraLiveItem&&qaCameraTrack.readyState==='ended'&&qaLiveTrack.readyState==='ended'&&assets.length===2&&assets.some(item=>item.title==='Camera clip')", 6);
        }
        private static async Task CheckSeedTerms(CoreWebView2 core)
        {
            await core.ExecuteScriptAsync(@"
                window.qaSeeds=(async()=>{
                    const originalGoogle=Mic.googleSearch,originalField=fieldJSON,originalLoad=loadFragment;
                    const calls=[],catalog=[];
                    try{
                        Mic.googleSearch=(id,term,offset)=>{
                          calls.push([term,offset]);
                          setTimeout(()=>googleResult(id,Array.from({length:6},(_,i)=>({
                            title:term,kind:'image',source:'Google Images',date:'Fixture',image:'fixture:'+term+':'+i
                          }))),30);
                        };
                        loadFragment=async item=>({...item,img:demo(0),poster:demo(0).toDataURL()});
                        $('source').value='google';$('source').onchange();setMediaMode('photos');setAbstractSearch(false);
                        $('words').value='night train,  ocean, Night Train, ,';setFragmentRange({min:4,max:4});
                        await gatherArchiveByCount();
                        if(assets.length!==4||new Set(assets.map(item=>item.title)).size!==2||calls.length!==2||
                           !calls.some(([term,offset])=>term==='night train'&&offset===0)||!calls.some(([term])=>term==='ocean'))return false;
                        fieldJSON=async url=>{
                          const q=new URL(url).searchParams.get('q');catalog.push(q);
                          return {collection:{items:[{data:[{nasa_id:q==='moon rock'?'first':'second',title:q}]}],metadata:{total_hits:1}}};
                        };
                        const videos=new URLSearchParams({source:'nasa',media:'videos',genre:'none',words:'moon rock, ocean'});
                        const clips=[];
                        for await(const page of searchAllPages(videos))clips.push(...page.items);
                        return clips.length===2&&catalog.length===2&&catalog.includes('moon rock')&&catalog.includes('ocean');
                    }finally{
                        Mic.googleSearch=originalGoogle;fieldJSON=originalField;loadFragment=originalLoad;
                        $('source').value='blended';$('source').onchange();$('words').value='';assets=[];showAssets();
                        setMediaMode('photos');setFragmentRange(DEFAULT_FRAGMENT_RANGE);
                    }
                })().then(result=>window.qaSeedsPassed=result);
            ");
            await Until(core, "window.qaSeedsPassed===true", 12);
        }
        private static async Task CheckTempoAndVideo(CoreWebView2 core, LoomWindow app, string target)
        {
            var media = app.Sources.ReadFolder(Path.Combine(target, "media"));
            await core.ExecuteScriptAsync(@"
                const qaClock=makeTempoClock(),tick=60000/120*tempoFraction('1/8').beats;
                const first=qaClock.advance(3500,tick),late=qaClock.advance(4425,tick);
                qaClock.pause(4475);
                const resumed=qaClock.advance(9000,tick),boundary=qaClock.advance(9050,tick);
                window.qaTempoMath=tick===250&&tempoFraction('3/12').beats===1&&tempoFraction('5/16').beats===1.25&&
                  first.steps===0&&late.steps===3&&Math.abs(late.phase-.7)<.0001&&resumed.steps===0&&Math.abs(resumed.phase-.9)<.0001&&boundary.steps===1&&tempoFraction('1/0')===null;
                const qaTimingMedia=" + LoomWindow.Json(media) + @";
                const qaTimingStill=qaTimingMedia.find(asset=>asset.kind==='image'),qaTimingClip=qaTimingMedia.find(asset=>asset.kind==='video');
                loadImages([{...qaTimingStill,title:'First'},qaTimingClip,{...qaTimingStill,title:'Third'}],++searchToken)
                  .then(result=>{assets=result.loaded;showAssets();$('defaultFx').click();});
            ");
            await Until(core, "qaTempoMath&&assets.length===3&&videoPlayers.get(assets[1])?.readyState>=2", 10);
            await core.ExecuteScriptAsync(@"
                restoreTempo({enabled:true,bpm:120,division:'3/12'});
                const title=$('tempoSummary').textContent;
                updateFragmentTempo(1000);updateFragmentTempo(1499);
                const before=a===0&&b===1&&morph>.99;
                updateFragmentTempo(1500);
                window.qaTempoRoute=before&&a===1&&b===2&&morph===0&&title.includes('3/12');
                restoreTempo();
                const picker=deckStrip.children[1].querySelector('.fragment-video-start select');
                window.qaStartVideo=assets[1];window.qaStartPicker=picker;
                const player=videoPlayers.get(qaStartVideo);player.currentTime=1;
                picker.value='beginning';picker.onchange();
                deckStrip.children[1].querySelector('.asset').click();
                window.qaStartedAtBeginning=player.currentTime<.05&&player.loop;
                picker.value='random';picker.onchange();
                const savedRandom=Math.random;try{Math.random=()=>.75;deckStrip.children[1].querySelector('.asset').click();}
                finally{Math.random=savedRandom;}
                window.qaRandomSeek=player.currentTime;manual=true;
            ");
            await Until(core, "qaTempoRoute&&qaStartedAtBeginning&&qaRandomSeek>.7&&!videoPlayers.get(qaStartVideo)?.loop&&videoPlayers.get(qaStartVideo)?.currentTime>.7", 6);
            await core.ExecuteScriptAsync("assets=[];showAssets();applyLook(false)");
        }
        private static async Task CheckMediaRanges(CoreWebView2 core, LoomWindow app, string target)
        {
            const long large = 2830412708;
            const int chunk = Sources.MediaChunkBytes;
            var bounded = Sources.BoundedMediaRange("bytes=2000000000-");
            if (bounded.ToString() != "bytes=2000000000-2004194303" ||
                Sources.BoundedMediaRange("bytes=-8000000").ToString() != "bytes=-4194304")
                throw new Exception("Upstream media range was not limited.");
            using (var response = new HttpResponseMessage(HttpStatusCode.PartialContent) { Content = new ByteArrayContent(new byte[32]) })
            {
                response.Content.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
                var uri = new Uri("https://test.invalid/fragment.mp4");
                response.Content.Headers.ContentRange = new ContentRangeHeaderValue(0, 31, large);
                bool rejected = false;
                try { await Sources.ReadMediaResponse(response, uri, false, CancellationToken.None); }
                catch (IOException ex) { rejected = ex.Message.Contains("512 MiB"); }
                if (!rejected) throw new Exception("An oversized online video was accepted.");
                response.Content.Headers.ContentRange = new ContentRangeHeaderValue(0, 31, 450L * 1024 * 1024);
                var accepted = await Sources.ReadMediaResponse(response, uri, false, CancellationToken.None);
                using (accepted.Body)
                    if (accepted.Code != 206 || accepted.Body.Length != 32) throw new Exception("A valid online chunk was rejected.");
            }
            var items = app.Sources.ReadFolder(Path.Combine(target, "range-media"), "videos");
            await core.ExecuteScriptAsync(@"
                const qaRanges=" + LoomWindow.Json(items) + @";
                const qaLarge=qaRanges.find(file=>file.title==='large-sparse.mp4');
                const qaMotion=qaRanges.find(file=>file.title==='range-playback.mp4');
                Promise.all(['bytes=0-','bytes=2000000000-','bytes=-32'].map(async range=>{
                    const res=await fetch(qaLarge.image,{headers:{Range:range}});
                    const bytes=await res.arrayBuffer();
                    return [res.status,res.headers.get('Content-Range'),bytes.byteLength];
                })).then(results=>window.qaRangeResults=results);
            ");
            string expected = LoomWindow.Json(new object[] {
                new object[]{ 206, "bytes 0-"+(chunk-1)+"/"+large, chunk },
                new object[]{ 206, "bytes 2000000000-2004194303/"+large, chunk },
                new object[]{ 206, "bytes "+(large-32)+"-"+(large-1)+"/"+large, 32 }
            });
            await Until(core, "JSON.stringify(window.qaRangeResults)===JSON.stringify(" + expected + ")", 10);
            await core.ExecuteScriptAsync(@"
                loadImages([qaMotion],++searchToken).then(result=>{
                  assets=result.loaded;showAssets();$('defaultFx').click();manual=true;
                  deckStrip.querySelector('.asset').click();manual=true;
                });
            ");
            await Until(core, "assets.length===1&&videoPlayers.get(assets[0])?.currentTime>.3", 15);
            await core.ExecuteScriptAsync("window.qaRangePlayer=videoPlayers.get(assets[0]);qaRangePlayer.currentTime=11");
            await Until(core, "!qaRangePlayer.seeking&&qaRangePlayer.currentTime>12", 12);
            await core.ExecuteScriptAsync("qaRangePlayer.currentTime=13.7");
            await Until(core, "!qaRangePlayer.paused&&!qaRangePlayer.seeking&&qaRangePlayer.currentTime<3", 10);
            await core.ExecuteScriptAsync("assets=[];showAssets();applyLook(false)");
        }
        private static async Task CheckDeck(CoreWebView2 core, LoomWindow app, string target)
        {
            var media = app.Sources.ReadFolder(Path.Combine(target, "media"));
            await core.ExecuteScriptAsync(@"
                const qaDeckItems=" + LoomWindow.Json(media) + @";
                const qaDeckStill=qaDeckItems.find(item=>item.kind==='image');
                const qaDeckClip=qaDeckItems.find(item=>item.kind==='video');
                loadImages([qaDeckStill,{...qaDeckStill,title:'Second still'},qaDeckClip],++searchToken)
                  .then(result=>{assets=result.loaded;showAssets();});
                window.qaStageFrame=()=>{
                  const sample=document.createElement('canvas');sample.width=24;sample.height=16;
                  sample.getContext('2d').drawImage(canvas,0,0,24,16);return sample.toDataURL();
                };
            ");
            await Until(core, "assets.length===3&&!$('shuffleDeck').disabled&&document.querySelectorAll('.deck-handle').length===3", 8);
            await core.ExecuteScriptAsync(@"
                $('defaultFx').click();
                window.qaVideoCard=assets[2];window.qaStillCard=assets[0];
                document.querySelectorAll('.deck-cell .asset')[2].click();manual=true;
            ");
            await Until(core, "assets[a]===qaVideoCard && fragmentFrame(qaVideoCard).tagName==='VIDEO' && videoPlayers.get(qaVideoCard).currentTime>.05", 6);
            await core.ExecuteScriptAsync("window.qaBefore=qaStageFrame();window.qaVideoPlayer=videoPlayers.get(qaVideoCard)");
            await Until(core, "qaStageFrame()!==qaBefore", 4);
            await core.ExecuteScriptAsync("$('effect').value=organicStyles[0];$('warp').value=0");
            await Task.Delay(250);
            await core.ExecuteScriptAsync("qaBefore=qaStageFrame()");
            await Until(core, "qaStageFrame()!==qaBefore", 4);
            await core.ExecuteScriptAsync("$('freeze').click()");
            await Until(core, "qaVideoPlayer.paused && videoPlayers.get(qaVideoCard)===qaVideoPlayer", 4);
            await core.ExecuteScriptAsync(@"
                $('freeze').click();window.qaDeckBefore=assets.slice();
                window.qaBlend=[assets[a],assets[b],morph];$('shuffleDeck').click();
            ");
            const string samePlayback = "assets[a]===qaBlend[0]&&assets[b]===qaBlend[1]&&morph===qaBlend[2]&&videoPlayers.get(qaVideoCard)===qaVideoPlayer&&!qaVideoPlayer.paused";
            await Until(core, samePlayback + "&&assets.some((item,i)=>item!==qaDeckBefore[i])&&qaDeckBefore.every(item=>assets.includes(item))", 4);
            await core.ExecuteScriptAsync("window.qaDragged=assets[0];deckStrip.scrollIntoView({block:'center'});deckStrip.scrollLeft=0");
            var serializer = new System.Web.Script.Serialization.JavaScriptSerializer();
            string rectangle = await core.ExecuteScriptAsync(@"(()=>{
                const handle=deckStrip.children[0].querySelector('.deck-handle').getBoundingClientRect();
                const last=deckStrip.children[2].getBoundingClientRect();
                return [handle.left+handle.width/2,handle.top+handle.height/2,last.right-12,last.top+last.height/2];
            })()");
            var points = serializer.Deserialize<double[]>(rectangle);
            await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", LoomWindow.Json(new { type = "mousePressed", x = points[0], y = points[1], button = "left", buttons = 1, clickCount = 1 }));
            await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", LoomWindow.Json(new { type = "mouseMoved", x = points[2], y = points[3], button = "left", buttons = 1 }));
            await Until(core, "deckStrip.children[2].dataset.drop==='after'", 3);
            await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", LoomWindow.Json(new { type = "mouseReleased", x = points[2], y = points[3], button = "left", clickCount = 1 }));
            await Until(core, samePlayback + "&&assets[2]===qaDragged&&deckStrip.children[2].querySelector('img').alt===qaDragged.title", 4);
            await core.ExecuteScriptAsync("deckStrip.children[2].querySelector('.deck-handle').focus()");
            await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent", LoomWindow.Json(new { type = "keyDown", key = "ArrowLeft", code = "ArrowLeft", windowsVirtualKeyCode = 37 }));
            await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent", LoomWindow.Json(new { type = "keyUp", key = "ArrowLeft", code = "ArrowLeft", windowsVirtualKeyCode = 37 }));
            await Until(core, samePlayback + "&&assets[1]===qaDragged&&!deckDrag", 4);
            await core.ExecuteScriptAsync("assets=[];showAssets();applyLook(false);window.scrollTo(0,0)");
        }
        private static async Task CheckType(CoreWebView2 core)
        {
            await core.ExecuteScriptAsync(@"
                $('typeTab').click();
                const firstFont=$('typeFont').value;
                $('nextTypeFont').click();
                const secondFont=$('typeFont').value;
                $('prevTypeFont').click();
                window.qaFontPicker=firstFont!==secondFont&&$('typeFont').value===firstFont&&$('typeFont').querySelectorAll('optgroup').length>=9;
                Promise.all([...typeFamilies].filter(font=>!font.startsWith('System ')).map(font=>
                  document.fonts.load('400 72px '+canvasTypeface({font}),'Aa0123')
                )).then(faces=>window.qaOfflineFonts=faces.every(list=>list.some(face=>face.status==='loaded')));
                $('typeWords').value='FADE TO\nGREEN';$('typeSplit').value='lines';$('typeFont').value='Cinzel';
                $('typeInk').value='#faab5d';$('typeLettering').value='Outline';$('typeTexture').value='Halftone';
                $('typeAngle').value='12';previewType();
            ");
            await Until(core, "qaFontPicker && window.qaOfflineFonts && !$('typePanel').hidden && !$('addType').disabled && $('typeStatus').textContent.includes('2 fragments')", 15);
            await core.ExecuteScriptAsync("$('addType').click()");
            await Until(core, "assets.length===2&&assets.every(x=>x.kind==='type'&&x.typeSpec.font==='Cinzel'&&x.typeSpec.angle===12)", 8);
            await core.ExecuteScriptAsync(@"
                document.querySelector('.deck-cell button[aria-label^=""Edit type""]').click();
                const rule=$('typeFontCatalog').sheet.cssRules[0];
                const src=rule.style.getPropertyValue('src').match(/[0-9a-f]{20}\.woff2/)[0];
                fetch('/type-fonts/'+src).then(response=>response.blob()).then(blob=>
                  $('typeFontFile').onchange({target:{value:'',files:[new File([blob],'test.woff2')]}})
                );
                $('typeWords').value='DRIFT';previewType();
            ");
            await Until(core, "$('typeFont').value.startsWith('TypeFont-')&&!$('addType').disabled", 5);
            await core.ExecuteScriptAsync("$('addType').click()");
            await Until(core, "assets[0].title==='DRIFT'&&exportTypeFonts().length===1", 7);
            await core.ExecuteScriptAsync(@"
                let qaSavedType;
                const qaRealDownload=download;
                download=blob=>{qaSavedType=blob;};
                $('save').click();download=qaRealDownload;
                assets=[];showAssets();
                $('import').onchange({target:{files:[new File([qaSavedType],'round-trip.json')]}});
            ");
            await Until(core, "assets.length===2&&assets[0].title==='DRIFT'&&assets[0].typeSpec.font.startsWith('TypeFont-')&&assets[0].img.width>10", 8);
            await core.ExecuteScriptAsync("closeType();assets=[];showAssets()");
        }
        private static async Task CheckRecordTriggers(CoreWebView2 core, LoomWindow app, string target)
        {
            app.SetTestClip(Path.Combine(target, "silent-test.mp4"));
            await core.ExecuteScriptAsync("$('recTrigger').value='immediate';$('recTrigger').onchange();$('recordClip').click()");
            await Until(core, "fileAudio.paused && !clipArmed && clipRecorder?.state==='recording'", 8);
            await Task.Delay(1500);
            await core.ExecuteScriptAsync("$('recordClip').click()");
            await Until(core, "$('clipStatus').textContent==='Clip saved.'", 30);

            app.SetTestClip(Path.Combine(target, "mic-trigger-test.mp4"));
            await core.ExecuteScriptAsync(@"
                $('recTrigger').value='armed';$('recTrigger').onchange();
                $('recordClip').click();
            ");
            await Until(core, "clipArmed && !clipRecorder && !$('recThresholdField').hidden", 5);
            await core.ExecuteScriptAsync(@"
                $('recordClip').click();
                window.qaArmCancelled=!clipArmed&&!clipRecorder;
                $('recordClip').click();
                const originalAmp=Mic.amplitude;
                $('micButton').textContent='Mic on';Mic.amplitude=()=>.01;checkClipGate();
                window.qaBelowThreshold=clipArmed&&!clipRecorder;
                Mic.amplitude=()=>1;checkClipGate();
                Mic.amplitude=originalAmp;$('micButton').textContent='Mic off';
            ");
            await Until(core, "qaArmCancelled && qaBelowThreshold && !clipArmed && clipRecorder?.state==='recording'", 8);
            await Task.Delay(1200);
            await core.ExecuteScriptAsync("$('recordClip').click()");
            await Until(core, "$('clipStatus').textContent==='Clip saved.'", 30);
        }
        private static async Task CheckMediaModes(CoreWebView2 core, LoomWindow app, string target)
        {
            string folder = Path.Combine(target, "media");
            await core.ExecuteScriptAsync(@"
                const qaModes=['photos','videos','both'];
                const qaModeFiles=" + LoomWindow.Json(new[] { app.Sources.ReadFolder(folder, "photos"), app.Sources.ReadFolder(folder, "videos"), app.Sources.ReadFolder(folder, "both") }) + @";
                const qaPick=Mic.folder;
                Mic.folder=mode=>folderPicked(qaModeFiles[qaModes.indexOf(mode)],'');
                setFragmentRange({min:2,max:2});$('source').value='folder';$('source').onchange();
            ");
            foreach (var mode in new[] { "photos", "videos", "both" })
            {
                await core.ExecuteScriptAsync("assets=[];showAssets();setMediaMode(" + LoomWindow.Json(mode) + ");$('excavate').click()");
                string condition = mode == "both"
                    ? "assets.length===2 && assets.some(item=>item.kind==='image') && assets.some(item=>item.kind==='video')"
                    : "assets.length===1 && assets[0].kind==='" + (mode == "videos" ? "video" : "image") + "'";
                await Until(core, "!$('excavate').disabled && " + condition, 10);
            }
            await core.ExecuteScriptAsync(@"
                Mic.folder=qaPick;
                const qaMediaDownload=download;let qaMediaSession;
                download=blob=>qaMediaSession=blob;$('save').click();download=qaMediaDownload;
                window.qaMediaSettings=false;
                (async()=>{
                  const data=JSON.parse(await qaMediaSession.text());
                  setMediaMode('photos');
                  await $('import').onchange({target:{files:[new File([JSON.stringify(data)],'new.json')]}});
                  const restored=mediaMode()==='both';
                  delete data.mediaMode;data.videoMode=true;setMediaMode('photos');
                  await $('import').onchange({target:{files:[new File([JSON.stringify(data)],'legacy.json')]}});
                  return restored&&mediaMode()==='both';
                })().then(result=>window.qaMediaSettings=result);
            ");
            await Until(core, "qaMediaSettings", 8);
            await core.ExecuteScriptAsync("setMediaMode('photos');$('source').value='blended';$('source').onchange();setFragmentRange(DEFAULT_FRAGMENT_RANGE)");
        }
        private static async Task CheckProgressiveSearch(CoreWebView2 core)
        {
            await core.ExecuteScriptAsync(@"
                const qaRealPages=searchAllPages,qaRealLoad=loadFragment;
                let qaFinishProvider,qaFinishFragment;
                const qaProviderGate=new Promise(resolve=>qaFinishProvider=resolve);
                const qaFragmentGate=new Promise(resolve=>qaFinishFragment=resolve);
                const qaReleased=[];
                const qaItems=[0,1,2].map(index=>({title:'Progress '+index,kind:'image',source:'Local file',
                    date:'fixture',image:demo(index).toDataURL(),onRelease:()=>qaReleased.push(index)}));
                async function* qaFastProvider(){yield {items:qaItems.slice(0,1)};}
                async function* qaSlowProvider(){await qaProviderGate;yield {items:qaItems.slice(1)};}
                searchAllPages=()=>mergeSearchPages([qaFastProvider(),qaSlowProvider()]);
                loadFragment=async item=>{
                    if(item===qaItems[1])await qaFragmentGate;
                    return qaRealLoad(item);
                };
                setMediaMode('photos');setFragmentRange({min:3,max:3});$('excavate').click();
            ");
            await Until(core, "$('excavate').disabled && assets.length===1 && assets[0].title==='Progress 0' && document.querySelectorAll('.deck-cell').length===1", 8);
            await core.ExecuteScriptAsync("const qaFirstCell=$('assets').firstChild;qaFinishProvider()");
            await Until(core, "$('excavate').disabled && assets.length===2 && assets[1].title==='Progress 2' && $('assets').firstChild===qaFirstCell", 8);
            await core.ExecuteScriptAsync("$('cancelFind').click();qaFinishFragment()");
            await Until(core, "!$('excavate').disabled && assets.length===2 && qaReleased.includes(1) && !qaReleased.includes(0) && !qaReleased.includes(2)", 8);
            await core.ExecuteScriptAsync("searchAllPages=qaRealPages;loadFragment=qaRealLoad;assets=[];showAssets();setFragmentRange(DEFAULT_FRAGMENT_RANGE)");
        }
        private static async Task CheckNewEffects(CoreWebView2 core)
        {
            await core.ExecuteScriptAsync(@"
                $('fragmentMin').value=37;$('fragmentMax').value=42;$('resetFragmentRange').click();
                const fxTest=document.createElement('canvas');fxTest.width=180;fxTest.height=120;
                const fxContext=fxTest.getContext('2d');
                const fxStill=[demo(0),demo(1),demo(2)];
                const fxOriginal=rack.save();
                const fxModes={psy:rackOptions.psy.slice(6),era:rackOptions.era.slice(4),layout:rackOptions.layout.slice(4),
                  spatial:rackOptions.spatial.slice(1),feedback:rackOptions.feedback.slice(1)};
                window.qaNewFx=Object.entries(fxModes).map(([key,styles])=>{
                  const renders=new Set();
                  for(const mode of styles){
                    rack.restore({[key]:mode,spaceMix:84,trail:key==='feedback'?55:0,seed:88,pitch:2,grainRate:0});
                    for(let i=0;i<8;i++){
                      fxContext.drawImage(fxStill[i%3],0,0,180,120);
                      rack.advance(.14);rack.process(fxContext,fxStill,.14,{speed:1,level:.4,pulse:.2});
                    }
                    renders.add(fxTest.toDataURL());
                  }
                  return renders.size===styles.length;
                }).every(Boolean);
                rack.restore(fxOriginal);
            ");
            await Until(core, "qaNewFx && readFragmentRange().min===10 && readFragmentRange().max===50", 6);
        }

        private static async Task CheckAbstractSearch(CoreWebView2 core, LoomWindow app, string target)
        {
            await core.ExecuteScriptAsync(@"
                const qaSearchOriginal=searchAllPages;
                const qaSearchItems=" + LoomWindow.Json(app.Sources.ReadFolder(Path.Combine(target, "media"))) + @";
                const qaTerms=[];
                searchAllPages=async function*(query){
                  const term=query.get('words');qaTerms.push(term);
                  yield {items:term==='ocean'?[]:qaSearchItems};
                };
                const qaLegacyCommon=commonsClip({
                  title:'File:Old footage.ogv',videoinfo:[{url:'https://upload.wikimedia.org/old.ogv',descriptionurl:'https://commons.wikimedia.org/wiki/File:Old.ogv',derivatives:[
                    {height:480,src:'https://upload.wikimedia.org/old.480.webm'},
                    {height:720,src:'https://upload.wikimedia.org/old.720.webm'}
                  ]}]
                },'search');
                $('source').value='blended';$('source').onchange();$('words').value='ocean';
                setAbstractSearch(true);
            ");
            foreach (var mode in new[] { "photos", "videos", "both" })
            {
                int targetCount = mode == "both" ? 2 : 1;
                await core.ExecuteScriptAsync("qaTerms.length=0;setMediaMode(" + LoomWindow.Json(mode) + ");setFragmentRange({min:" +
                    targetCount + ",max:" + targetCount + "});$('excavate').click()");
                string condition = mode == "both"
                    ? "assets.some(item=>item.kind==='image') && assets.some(item=>item.kind==='video')"
                    : "assets[0]?.kind==='" + (mode == "videos" ? "video" : "image") + "'";
                await Until(core, @"!$('excavate').disabled && !$('searchTerms').hidden &&
                    qaTerms[0]==='ocean' && qaTerms.length===2 && qaTerms[1]!=='ocean' &&
                    $('searchTermsList').lastChild.textContent===qaTerms[1] && qaLegacyCommon.image.includes('old.480.webm') &&
                    assets.length===" + targetCount + " && " + condition, 14);
            }
            await core.ExecuteScriptAsync("searchAllPages=qaSearchOriginal;setAbstractSearch(false);clearSearchTerms();assets=[];showAssets();setMediaMode('photos');setFragmentRange(DEFAULT_FRAGMENT_RANGE)");
        }

        private static async Task CheckDetachedDisplay(CoreWebView2 core, LoomWindow app, string target)
        {
            await core.ExecuteScriptAsync("loadImages(" + LoomWindow.Json(app.Sources.ReadFolder(Path.Combine(target, "media"))) +
                ",++searchToken).then(result=>{assets=result.loaded;showAssets();choose(assets.findIndex(item=>item.kind==='video'))})");
            await Until(core, "assets.some(item=>item.kind==='video'&&videoPlayers.get(item)?.readyState>=2)", 10);
            var controlsBounds = app.Bounds;
            var controlsScreen = System.Windows.Forms.Screen.FromControl(app);
            await core.ExecuteScriptAsync("$('detachDisplay').click()");
            await Until(core, "isDisplayOpen() && !$('displayFullscreen').hidden && getComputedStyle($('stageWrap')).display==='none' && outputWindow.document.querySelector('canvas').width===canvas.width && canvas.width>1", 12);
            var display = app.DetachedDisplay;
            var displayBounds = display.Bounds;
            var displayScreen = System.Windows.Forms.Screen.FromControl(display);
            if (System.Windows.Forms.Screen.AllScreens.Length > 1 && controlsScreen.DeviceName == displayScreen.DeviceName)
                throw new Exception("The detached display did not open on the other monitor.");
            var output = display.View.CoreWebView2;
            await core.ExecuteScriptAsync(@"
                window.qaDisplaySample=()=>{
                  const sample=document.createElement('canvas');sample.width=32;sample.height=20;
                  sample.getContext('2d').drawImage(outputWindow.document.querySelector('canvas'),0,0,32,20);
                  return sample.toDataURL();
                };
                window.qaDisplayBefore=qaDisplaySample();
            ");
            await Until(core, "qaDisplaySample()!==qaDisplayBefore", 5);
            await core.ExecuteScriptAsync("$('displayFullscreen').click()");
            await Until(output, "document.documentElement.classList.contains('fullscreen')", 5);
            if (display.Bounds != displayScreen.Bounds || !display.TopMost ||
                display.FormBorderStyle != System.Windows.Forms.FormBorderStyle.None || app.Bounds != controlsBounds || app.IsFullscreen)
                throw new Exception("Detached fullscreen moved or covered the controls window's frame.");

            app.WindowState = System.Windows.Forms.FormWindowState.Minimized;
            try
            {
                await core.ExecuteScriptAsync("window.qaDisplayBefore=qaDisplaySample()");
                await Until(core, "stageFrameClock===outputWindow && qaDisplaySample()!==qaDisplayBefore && assets.some(item=>videoPlayers.get(item)?.readyState>=2)", 8);
            }
            finally { app.WindowState = System.Windows.Forms.FormWindowState.Normal; }

            app.SetTestClip(Path.Combine(target, "detached-display.mp4"));
            await core.ExecuteScriptAsync("$('recTrigger').value='immediate';$('recTrigger').onchange();$('recordClip').click()");
            await Until(core, "clipRecorder?.state==='recording'", 8);
            await Task.Delay(1400);
            await core.ExecuteScriptAsync("$('recordClip').click();$('recTrigger').value='armed';$('recTrigger').onchange()");
            await Until(core, "$('clipStatus').textContent==='Clip saved.' && isDisplayOpen()", 30);

            await output.ExecuteScriptAsync("dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
            await Until(output, "!document.documentElement.classList.contains('fullscreen')", 4);
            if (display.Bounds != displayBounds) throw new Exception("The display did not restore its windowed bounds.");
            display.Close();
            await Until(core, "!isDisplayOpen() && $('displayFullscreen').hidden && getComputedStyle($('stageWrap')).display!=='none' && stageFrameClock===window", 5);
            await core.ExecuteScriptAsync("$('detachDisplay').click()");
            await Until(core, "isDisplayOpen() && !$('detachDisplay').disabled", 8);
            await core.ExecuteScriptAsync("$('detachDisplay').click()");
            await Until(core, "!isDisplayOpen() && $('detachDisplay').textContent==='Detach display'", 5);
            await core.ExecuteScriptAsync("assets=[];showAssets()");
        }

        private static async Task CheckWindowFragment(CoreWebView2 core)
        {
            await core.ExecuteScriptAsync(@"
                const qaCaptureSource=document.createElement('canvas');qaCaptureSource.width=160;qaCaptureSource.height=120;
                const qaCapturePaint=qaCaptureSource.getContext('2d');
                const qaCaptureFunction=navigator.mediaDevices.getDisplayMedia;
                let qaCaptureCounter=0;
                const qaCaptureTimer=setInterval(()=>{qaCapturePaint.fillStyle='hsl('+qaCaptureCounter++*15+' 75% 50%)';qaCapturePaint.fillRect(0,0,160,120);},35);
                const qaSharedAudio=new AudioContext(),qaSharedTone=qaSharedAudio.createOscillator();
                const qaSharedDestination=qaSharedAudio.createMediaStreamDestination();qaSharedTone.connect(qaSharedDestination);qaSharedTone.start();qaSharedAudio.resume();
                navigator.mediaDevices.getDisplayMedia=async()=>new MediaStream([...qaCaptureSource.captureStream(25).getVideoTracks(),...qaSharedDestination.stream.getAudioTracks()]);
                $('captureWindow').click();
            ");
            await Until(core, "assets.some(x=>x.liveStream && videoPlayers.get(x)?.readyState>=2)", 8);
            await core.ExecuteScriptAsync("document.querySelector('.use-fragment-audio').click()");
            await Until(core, "fileAudio.srcObject && !fileAudio.paused && audioMonitor.gain.value===0 && readDriver('audio',.016).level>.02", 6);
            await core.ExecuteScriptAsync("$('stopFile').click();$('restoreFragmentAudio').click();$('captureWindow').click();clearInterval(qaCaptureTimer);qaSharedTone.stop();qaSharedAudio.close();navigator.mediaDevices.getDisplayMedia=qaCaptureFunction");
            await Until(core, "!assets.some(x=>x.liveStream)&&$('captureWindow').textContent==='Capture window'", 4);
        }

        private static async Task CheckCatalogs(CoreWebView2 core, StreamWriter log)
        {
            foreach (var entry in new[] { new[] { "nasa", "earth", "NASA" }, new[] { "peertube", "blender", "PeerTube" } })
            {
                await core.ExecuteScriptAsync("setMediaMode('videos');$('source').value="+LoomWindow.Json(entry[0])+";$('source').onchange();$('words').value="+LoomWindow.Json(entry[1])+";$('excavate').click()");
                await Until(core,"!$('excavate').disabled&&assets[0]?.source==="+LoomWindow.Json(entry[2])+"&&assets[0]?.kind==='video'",50);
                await Until(core,"videoPlayers.get(assets[0])?.currentTime>.10",12);
                log.WriteLine(entry[2] + " supplied a playable moving clip");
            }
            await core.ExecuteScriptAsync("setMediaMode('photos')");
        }

        private static async Task CheckVideoAudio(CoreWebView2 core, LoomWindow app, string target)
        {
            await core.ExecuteScriptAsync("window.qaVideoAudioReady=false;loadImages(" +
                LoomWindow.Json(app.Sources.ReadFolder(Path.Combine(target, "sound-media"))) +
                ",++searchToken).then(result=>{assets=result.loaded;showAssets();qaVideoAudioReady=true})");
            await Until(core,"qaVideoAudioReady&&assets[0]?.kind==='video'",10);
            string wav = Convert.ToBase64String(File.ReadAllBytes(Path.Combine(target, "tone.wav")));
            await core.ExecuteScriptAsync("const qaPreviousAudio='data:audio/wav;base64," + wav + "';assignAudioMedia(qaPreviousAudio);" +
                "$('audioName').textContent='Previously loaded WAV';$('driver').value='audio';$('driver').onchange();fileAudio.loop=true;ensureAudio().then(()=>fileAudio.play())");
            await Until(core, "!fileAudio.paused&&fileAudio.currentTime>0", 8);
            await core.ExecuteScriptAsync("document.querySelector('.use-fragment-audio').click()");
            await Until(core,"!fileAudio.paused && fileAudio.currentTime>0 && readDriver('audio',.016).level>.02 && !$('restoreFragmentAudio').hidden && fileAudio.getAttribute('src')!==qaPreviousAudio",10);
            await core.ExecuteScriptAsync("$('restoreFragmentAudio').click()");
            await Until(core,"fileAudio.getAttribute('src')===qaPreviousAudio && !fileAudio.paused && $('audioName').textContent==='Previously loaded WAV' && $('restoreFragmentAudio').hidden",8);
            await core.ExecuteScriptAsync(@"
                const qaRealTrackCheck=hasVideoSoundtrack;
                hasVideoSoundtrack=()=>!fileAudio.getAttribute('src')?.startsWith('/folder/')&&qaRealTrackCheck();
                document.querySelector('.use-fragment-audio').click();
            ");
            await Until(core, "fileAudio.getAttribute('src')?.startsWith('/decoded-audio/') && !fileAudio.paused && readDriver('audio',.016).level>.02", 15);
            app.SetTestClip(Path.Combine(target, "decoded-video-audio.mp4"));
            await core.ExecuteScriptAsync("$('recordClip').click()");
            await Until(core, "clipRecorder?.state==='recording'", 8);
            await Task.Delay(1300);
            await core.ExecuteScriptAsync("$('recordClip').click()");
            await Until(core, "$('clipStatus').textContent==='Clip saved.'", 30);
            await core.ExecuteScriptAsync("hasVideoSoundtrack=qaRealTrackCheck;$('restoreFragmentAudio').click()");
            await Until(core, "fileAudio.getAttribute('src')===qaPreviousAudio && !fileAudio.paused", 8);
            await core.ExecuteScriptAsync("$('stopFile').click();assignAudioMedia(null)");
        }
        private static async Task CheckAsio(CoreWebView2 core, StreamWriter log)
        {
            var samples = Marshal.AllocHGlobal(8);
            try
            {
                Marshal.Copy(new[] { .05f, -.05f }, 0, samples, 2);
                if (Math.Abs(AsioInput.BufferLevel(samples, 2, NAudio.Wave.Asio.AsioSampleType.Float32LSB) - .468) > .001)
                    throw new Exception("ASIO float meter returned the wrong level.");
                Marshal.Copy(new byte[] { 0, 0, 8, 0, 0, 248 }, 0, samples, 6);
                if (Math.Abs(AsioInput.BufferLevel(samples, 2, NAudio.Wave.Asio.AsioSampleType.Int24LSB) - .585) > .001)
                    throw new Exception("ASIO 24-bit meter did not sign-extend the samples.");
            }
            finally { Marshal.FreeHGlobal(samples); }
            long second = System.Diagnostics.Stopwatch.Frequency;
            if (AsioInput.BuffersStalled(3 * second, second, 0) ||
                !AsioInput.BuffersStalled(5 * second, second, 0) ||
                AsioInput.BuffersStalled(5 * second, second, 5 * second) ||
                !AsioInput.BuffersStalled(5 * second, second, 3 * second))
                throw new Exception("ASIO callback freshness and startup grace did not match.");
            string connected = await core.ExecuteScriptAsync("Array.from($('micDevice').options).some(o=>o.value.startsWith('asio:')&&o.textContent.includes('L6max'))");
            if (connected != "true") { log.WriteLine("L6max ASIO driver absent."); return; }
            await core.ExecuteScriptAsync(@"
                const qaMicPrevious=localStorage.getItem('windowsMicInput');
                const qaZoom=Array.from($('micDevice').options).find(o=>o.value.startsWith('asio:')&&o.textContent.includes('L6max')).value;
                $('micDevice').value=qaZoom;$('micDevice').dispatchEvent(new Event('change'));Mic.toggle();
            ");
            await Until(core, "!$('micDevice').disabled", 10);
            log.WriteLine("Zoom hardware: " + await core.ExecuteScriptAsync("JSON.stringify({status:$('status').textContent,visible:!$('micChannelField').hidden,channels:Array.from($('micChannel').options,o=>o.text)})"));
            bool physical = await core.ExecuteScriptAsync("!$('micChannelField').hidden") == "true";
            if (!physical)
            {
                string driver = "ZOOM L6max ASIO Driver";
                await core.ExecuteScriptAsync(@"
                    const qaPost=chrome.webview.postMessage;
                    chrome.webview.postMessage=function(message){
                      if(message.action==='asioOpen'){
                        queueMicrotask(()=>Mic.asioOpened(" + LoomWindow.Json(AsioInput.ChannelLabels(driver,14,index=>"")) +
                        ",null," + LoomWindow.Json(AsioInput.StereoLabels(driver,14)) + @"));
                      }else if(message.action!=='asioStop')qaPost.call(this,message);
                    };
                    Mic.toggle();
                ");
            }
            await Until(core, "$('micChannel').options.length>=2 && $('micButton').textContent==='Mic on'", 4);
            {
                await core.ExecuteScriptAsync("$('micChannel').value='1';$('micChannel').dispatchEvent(new Event('change'))");
                await Until(core, "localStorage.getItem('windowsAsioChannel:'+qaZoom.slice(5))==='1'", 3);
                await core.ExecuteScriptAsync("$('micChannel').value='6,7';$('micChannel').dispatchEvent(new Event('change'))");
                await Until(core, "$('micChannel').selectedOptions[0]?.textContent==='CH 6 L/R'&&localStorage.getItem('windowsAsioChannel:'+qaZoom.slice(5))==='6,7'", 3);
                string responds = await core.ExecuteScriptAsync(@"(()=>{
                    const a=Array(14).fill(0),b=Array(14).fill(0),other=Array(14).fill(0);
                    a[6]=.6;b[7]=.6;other[5]=1;
                    Mic.asioLevels(a);const left=Mic.amplitude();
                    Mic.asioLevels(b);const right=Mic.amplitude();
                    Mic.asioLevels(other);const excluded=Mic.amplitude();
                    return left>.4&&Math.abs(left-right)<1e-8&&excluded===0;
                })()");
                if (responds != "true") throw new Exception("Stereo pair did not isolate the two selected channels.");
                var labels = AsioInput.ChannelLabels(driver: "ZOOM L6max ASIO Driver", count: 14, getName: index => "");
                var stereo = AsioInput.StereoLabels("ZOOM L6max ASIO Driver", 14);
                string recovered = await core.ExecuteScriptAsync(@"(()=>{
                    const samples=Array(14).fill(0);samples[6]=.5;
                    Mic.asioLevels(samples);Mic.asioRecovering();
                    const cleared=Mic.amplitude()===0 && $('micSignal').value===0 && $('micButton').textContent==='Mic on';
                    Mic.asioRecovered(" + LoomWindow.Json(labels) + ",null," + LoomWindow.Json(stereo) + @");
                    Mic.asioLevels(samples);
                    return cleared && $('micChannel').value==='6,7' && Mic.amplitude()>.3;
                })()");
                if (recovered != "true") throw new Exception("ASIO recovery retained stale levels or lost the stereo selection.");
                log.WriteLine("ASIO recovery cleared the meter, preserved CH 6 L/R, and resumed level updates.");
                log.WriteLine((physical ? "Physical Zoom ASIO capture opened. " : "Simulated Zoom inputs. ") + "CH 6 L/R selected and both sides verified with simulated levels.");
                await core.ExecuteScriptAsync("Mic.toggle()");
            }
            if (!physical) await core.ExecuteScriptAsync("chrome.webview.postMessage=qaPost");
            await core.ExecuteScriptAsync("$('micDevice').value=qaMicPrevious||'';$('micDevice').dispatchEvent(new Event('change'));if(qaMicPrevious===null)localStorage.removeItem('windowsMicInput');");
        }
        private static async Task CheckMicrophone(CoreWebView2 core)
        {
            await core.ExecuteScriptAsync(@"
                const qaMedia=navigator.mediaDevices,qaEnum=qaMedia.enumerateDevices,qaOpen=qaMedia.getUserMedia;
                const qaSavedMic=localStorage.getItem('windowsMicInput'),qaContext=new AudioContext();
                const qaRequests=[];
                qaMedia.enumerateDevices=async()=>['first','second'].map(deviceId=>({kind:'audioinput',deviceId,label:deviceId}));
                qaMedia.getUserMedia=async request=>{
                  qaRequests.push(request.audio.deviceId?.exact);
                  return qaContext.createMediaStreamDestination().stream;
                };
                Mic.refreshInputs();
            ");
            await Until(core, "Array.from($('micDevice').options).some(o=>o.value==='second')", 3);
            await core.ExecuteScriptAsync("$('micDevice').value='first';$('micDevice').dispatchEvent(new Event('change'));Mic.toggle()");
            await Until(core, "$('micButton').textContent==='Mic on'&&qaRequests[0]==='first'", 5);
            await core.ExecuteScriptAsync("$('micDevice').value='second';$('micDevice').dispatchEvent(new Event('change'))");
            await Until(core, "!$('micDevice').disabled&&$('micButton').textContent==='Mic on'&&qaRequests[1]==='second'&&localStorage.getItem('windowsMicInput')==='second'", 5);
            await core.ExecuteScriptAsync("Mic.toggle();qaMedia.enumerateDevices=qaEnum;qaMedia.getUserMedia=qaOpen;qaContext.close();if(qaSavedMic===null)localStorage.removeItem('windowsMicInput');else localStorage.setItem('windowsMicInput',qaSavedMic);");
        }

        private static void CheckNativeFullscreen(LoomWindow app)
        {
            var display = System.Windows.Forms.Screen.FromControl(app).Bounds;
            if (!app.TopMost || app.FormBorderStyle != System.Windows.Forms.FormBorderStyle.None ||
                app.RectangleToScreen(app.ClientRectangle) != display)
                throw new Exception("The native window did not cover the full display without borders.");
            var taskbar = FindWindow("Shell_TrayWnd", null);
            if (taskbar == IntPtr.Zero) return;
            for (var hwnd = GetTopWindow(IntPtr.Zero); hwnd != IntPtr.Zero; hwnd = GetWindow(hwnd, 2))
            {
                if (hwnd == app.Handle) return;
                if (hwnd == taskbar) throw new Exception("The Windows taskbar is above the fullscreen app.");
            }
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string type, string title);
        [DllImport("user32.dll")] private static extern IntPtr GetTopWindow(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr hwnd, uint direction);
        private static async Task CheckOrganicMorphs(CoreWebView2 core, string target)
        {
            await core.ExecuteScriptAsync(@"
                frozen=true;
                let qaStyle=$('effect').value, qaWarpValue=$('warp').value;
                $('warp').value=.82;
                const qaSheet=document.createElement('canvas');qaSheet.width=960;qaSheet.height=252*Math.ceil(organicStyles.length/3);
                const gallery=qaSheet.getContext('2d');
                const originals=demo(0),incoming=demo(1),hashes=new Set();
                const renderer=createOrganicRenderer();if(!renderer)throw Error('WebGL unavailable.');organicRenderer=renderer;
                const seed=organicSeed,width=canvas.width,height=canvas.height;canvas.width=384;canvas.height=270;
                let changes=0, audioChanges=0, seedChanges=0;
                function sample(p,t,level=0,pulse=0){
                  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
                  if(!drawOrganicMorph(originals,incoming,p,t,{level,pulse}))throw Error('Organic draw failed');
                  return canvas.toDataURL();
                }
                organicStyles.forEach((style,i)=>{
                  $('effect').value=style;organicSeed=seed;
                  const calm=sample(.48,.7);
                  hashes.add(calm);
                  if(calm!==sample(.31,2.1))changes++;
                  if(calm!==sample(.48,.7,.7,.65))audioChanges++;
                  organicSeed+=17;if(calm!==sample(.48,.7))seedChanges++;
                  sample(.48,.7,.38,.4);
                  const x=(i%3)*320,y=Math.floor(i/3)*252;
                  gallery.drawImage(canvas,x,y,320,227);
                  gallery.fillStyle='#101817';gallery.fillRect(x,y+227,320,25);
                  gallery.font='14px sans-serif';gallery.fillStyle='white';gallery.fillText(style,x+11,y+244);
                });
                window.qaOrganic={styles:hashes.size,changes,audioChanges,seedChanges,compiled:organicRenderer===renderer};
                window.qaOrganicImage=qaSheet.toDataURL('image/png').split(',')[1];
                canvas.width=width;canvas.height=height;organicSeed=seed;$('effect').value=qaStyle;$('warp').value=qaWarpValue;updateOutputs();frozen=false;
            ");
            string outcome = await core.ExecuteScriptAsync("JSON.stringify(qaOrganic)");
            await Until(core, "qaOrganic.styles===30 && qaOrganic.changes===30 && qaOrganic.audioChanges===30 && qaOrganic.seedChanges===30 && qaOrganic.compiled", 10);
            var serializer = new System.Web.Script.Serialization.JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 };
            var image = serializer.Deserialize<string>(await core.ExecuteScriptAsync("qaOrganicImage"));
            File.WriteAllBytes(Path.Combine(target, "organic-morphs.png"), Convert.FromBase64String(image));
        }
        private static async Task CheckRemoteVideo(CoreWebView2 core)
        {
            await core.ExecuteScriptAsync(@"
                setMediaMode('videos');
                setFragmentRange({min:1,max:1});
                $('date').value='1951-01-01';$('window').value='1825';$('words').value='Duck and Cover';
                $('source').value='ia';$('excavate').click();
            ");
            await Until(core, "!$('excavate').disabled&&assets.length===1&&assets[0].kind==='video'&&assets[0].source==='Internet Archive'", 65);
            await Until(core, "videoPlayers.get(assets[0])?.currentTime>.15", 12);
            await core.ExecuteScriptAsync("setMediaMode('photos');$('date').value='1999-06-15';$('window').value='365'");
        }
        private static async Task CheckLargeDeck(CoreWebView2 core)
        {
            await core.ExecuteScriptAsync(@"
                setFragmentRange({min:512,max:512});
                const fixture=document.createElement('canvas');
                fixture.width=640;fixture.height=400;
                const pen=fixture.getContext('2d');
                pen.fillStyle='#bbd899';pen.fillRect(0,0,640,400);
                const image=fixture.toDataURL();
                async function* testPages(){
                  for(let page=0;page<32;page++)yield {items:Array.from({length:16},(_,i)=>({
                    title:'Fragment '+(page*16+i), image, link:'https://example.invalid/'+(page*16+i), date:'Local file', source:'Local file'
                  }))};
                }
                collectFragments(testPages(),++searchToken,chooseFragmentTarget()).then(result=>{assets=result.loaded;showAssets();});
            ");
            await Until(core, "assets.length===512 && $('fragmentMax').max==='512' && assets.every(x=>x.img.width===256) && document.querySelectorAll('.deck-cell').length===512", 35);
            await Until(core, "stageImages.size===2 && fragmentFrame(assets[0]).naturalWidth===640", 5);
        }
        private static async Task CheckSliders(CoreWebView2 core)
        {
            await Until(core, "document.querySelectorAll('input[type=range]').length===23 && !document.querySelector('button.knob-card')", 3);
            await core.ExecuteScriptAsync("$('warp').value=0;updateOutputs();$('warp').scrollIntoView({block:'center'});$('warp').focus()");
            string point = await core.ExecuteScriptAsync("JSON.stringify((()=>{const r=$('warp').getBoundingClientRect();return {x:r.left+r.width*.7,y:r.top+r.height*.5};})())");
            var serializer = new System.Web.Script.Serialization.JavaScriptSerializer();
            var coordinates = serializer.Deserialize<System.Collections.Generic.Dictionary<string, double>>(serializer.Deserialize<string>(point));
            double x = coordinates["x"], y = coordinates["y"];
            await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", LoomWindow.Json(new { type = "mousePressed", x, y, button = "left", clickCount = 1 }));
            await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", LoomWindow.Json(new { type = "mouseReleased", x, y, button = "left", clickCount = 1 }));
            await Until(core, "Number($('warp').value)>.5 && $('warpValue').textContent!=='0%'", 3);
            await core.ExecuteScriptAsync("window.qaWarp=Number($('warp').value)");
            await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent", LoomWindow.Json(new { type = "keyDown", key = "ArrowRight", code = "ArrowRight", windowsVirtualKeyCode = 39 }));
            await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent", LoomWindow.Json(new { type = "keyUp", key = "ArrowRight", code = "ArrowRight", windowsVirtualKeyCode = 39 }));
            await Until(core, "Number($('warp').value)>qaWarp", 3);
            await core.ExecuteScriptAsync("$('rack').querySelector('details').open=true;document.querySelector('.rack-tabs button:last-child').click()");
            await Until(core, "Array.from(document.querySelectorAll('.knob-grid')).at(-1).querySelector('input[type=range]').getBoundingClientRect().width>0", 3);
        }
        private static async Task Until(CoreWebView2 core, string condition, int seconds)
        {
            var end = DateTime.UtcNow.AddSeconds(seconds);
            do
            {
                if (await core.ExecuteScriptAsync(condition) == "true") return;
                await Task.Delay(150);
            } while (DateTime.UtcNow < end);
            throw new Exception("Timed out: " + condition);
        }
    }
}
