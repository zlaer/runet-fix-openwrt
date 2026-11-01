pub fn get_zapret_args(preset: &str, custom: Option<&str>) -> String {
    let bin_dir = "/usr/share/runet-fix/bin";

    match preset {
        "youtube_4k" => {
            "--dpi-desync=fake,multisplit --dpi-desync-split-pos=1 --dpi-desync-fooling=badseq,md5sig --dpi-desync-repeats=6".to_string()
        }
        "fakedsplit_badseq" => {
            "--dpi-desync=fakedsplit --dpi-desync-split-pos=1 --dpi-desync-fooling=badseq,md5sig --dpi-desync-repeats=6".to_string()
        }
        "multisplit_badsum" => {
            "--dpi-desync=fake,multisplit --dpi-desync-split-pos=1 --dpi-desync-fooling=badsum --dpi-desync-repeats=4".to_string()
        }
        "disorder2_badseq" => {
            "--dpi-desync=disorder2 --dpi-desync-split-pos=1 --dpi-desync-fooling=badseq".to_string()
        }
        "split2_pos2" => {
            "--dpi-desync=fake,split2 --dpi-desync-split-pos=2 --dpi-desync-fooling=badseq --dpi-desync-repeats=4".to_string()
        }
        "wsize_badsum" => {
            "--dpi-desync=fake,split2 --dpi-desync-split-pos=1 --dpi-desync-fooling=badsum --dpi-desync-wsize=4".to_string()
        }
        "tls_cutoff" => {
            "--dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fooling=badseq,md5sig --dpi-desync-cutoff=d4".to_string()
        }
        "discord_fix" => {
            "--dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-any-protocol=1 --dpi-desync-cutoff=n3".to_string()
        }
        "general_alt" => {
            format!("--dpi-desync=fake,fakedsplit --dpi-desync-repeats=6 --dpi-desync-fooling=ts --dpi-desync-fakedsplit-pattern=0x00 --dpi-desync-fake-tls={}/stun.bin --dpi-desync-fake-tls={}/tls_clienthello_www_google_com.bin --dpi-desync-fake-http={}/tls_clienthello_www_sferum_ru.bin", bin_dir, bin_dir, bin_dir)
        }
        "general_alt2" => {
            format!("--dpi-desync=multisplit --dpi-desync-split-seqovl=652 --dpi-desync-split-pos=2 --dpi-desync-split-seqovl-pattern={}/tls_clienthello_www_google_com.bin", bin_dir)
        }
        "general_alt3" => {
            format!("--dpi-desync=fake,hostfakesplit --dpi-desync-fake-tls-mod=rnd,dupsid,sni=ya.ru --dpi-desync-hostfakesplit-mod=host=ya.ru,altorder=1 --dpi-desync-fooling=ts --dpi-desync-fake-http={}/tls_clienthello_www_sferum_ru.bin", bin_dir)
        }
        "general_alt4" => {
            format!("--dpi-desync=fake,multisplit --dpi-desync-repeats=6 --dpi-desync-fooling=badseq --dpi-desync-badseq-increment=1000 --dpi-desync-fake-tls={}/stun.bin --dpi-desync-fake-tls={}/tls_clienthello_www_google_com.bin --dpi-desync-fake-http={}/tls_clienthello_www_sferum_ru.bin", bin_dir, bin_dir, bin_dir)
        }
        "general_alt5" => {
            "--dpi-desync=syndata,multidisorder".to_string()
        }
        "general_alt6" => {
            format!("--dpi-desync=multisplit --dpi-desync-split-seqovl=681 --dpi-desync-split-pos=1 --dpi-desync-split-seqovl-pattern={}/tls_clienthello_www_google_com.bin", bin_dir)
        }
        "general_alt7" => {
            format!("--dpi-desync=multisplit --dpi-desync-split-pos=2,sniext+1 --dpi-desync-split-seqovl=679 --dpi-desync-split-seqovl-pattern={}/tls_clienthello_www_google_com.bin", bin_dir)
        }
        "general_alt8" => {
            format!("--dpi-desync=fake --dpi-desync-fake-tls-mod=none --dpi-desync-repeats=6 --dpi-desync-fooling=badseq --dpi-desync-badseq-increment=2 --dpi-desync-fake-http={}/tls_clienthello_www_sferum_ru.bin", bin_dir)
        }
        "general_alt9" => {
            "--dpi-desync=hostfakesplit --dpi-desync-repeats=4 --dpi-desync-fooling=ts,md5sig --dpi-desync-hostfakesplit-mod=host=ozon.ru".to_string()
        }
        "general_alt10" => {
            format!("--dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fooling=ts --dpi-desync-fake-tls={}/stun.bin --dpi-desync-fake-tls={}/tls_clienthello_4pda_to.bin --dpi-desync-fake-http={}/tls_clienthello_www_sferum_ru.bin", bin_dir, bin_dir, bin_dir)
        }
        "general_alt11" => {
            format!("--dpi-desync=fake,multisplit --dpi-desync-split-seqovl=664 --dpi-desync-split-pos=1 --dpi-desync-fooling=ts --dpi-desync-repeats=8 --dpi-desync-split-seqovl-pattern={}/tls_clienthello_www_sferum_ru.bin --dpi-desync-fake-tls={}/stun2.bin --dpi-desync-fake-tls={}/tls_clienthello_www_sferum_ru.bin --dpi-desync-fake-http={}/tls_clienthello_www_sferum_ru.bin", bin_dir, bin_dir, bin_dir, bin_dir)
        }
        "general_alt12" => {
            format!("--dpi-desync=fake,multisplit --dpi-desync-split-seqovl=664 --dpi-desync-split-pos=1 --dpi-desync-fooling=ts --dpi-desync-repeats=8 --dpi-desync-split-seqovl-pattern={}/tls_clienthello_www_sferum_ru.bin --dpi-desync-fake-tls={}/stun.bin --dpi-desync-fake-tls={}/tls_clienthello_www_sferum_ru.bin --dpi-desync-fake-http={}/tls_clienthello_www_sferum_ru.bin", bin_dir, bin_dir, bin_dir, bin_dir)
        }
        "general_alt13" => {
            format!("--dpi-desync=fake,hostfakesplit --dpi-desync-fooling=ts --dpi-desync-hostfakesplit-mod=host=mail.ru,altorder=1 --dpi-desync-repeats=5 --dpi-desync-fake-tls={}/tls_clienthello_sochi_park.bin --dpi-desync-fake-tls={}/stun2.bin --dpi-desync-fake-http={}/tls_clienthello_sochi_park.bin", bin_dir, bin_dir, bin_dir)
        }
        "general_fake_tls_auto" => {
            "--dpi-desync=fake,multidisorder --dpi-desync-split-pos=1,midsld --dpi-desync-repeats=11 --dpi-desync-fooling=badseq --dpi-desync-fake-tls=0x00000000".to_string()
        }
        "flowseal_general" => {
            format!("--dpi-desync=fake,multisplit --dpi-desync-split-seqovl=664 --dpi-desync-split-pos=1 --dpi-desync-fooling=badseq,md5sig --dpi-desync-repeats=6 --dpi-desync-fake-tls={}/tls_clienthello_www_google_com.bin", bin_dir)
        }
        "custom" => {
            custom.unwrap_or("").to_string()
        }
        _ => {
            // Default: youtube_4k
            "--dpi-desync=fake,multisplit --dpi-desync-split-pos=1 --dpi-desync-fooling=badseq,md5sig --dpi-desync-repeats=6".to_string()
        }
    }
}

pub fn print_args(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let preset = args.get(0).map(|s| s.as_str()).unwrap_or("youtube_4k");
    let custom = args.get(1).map(|s| s.as_str());
    println!("{}", get_zapret_args(preset, custom));
    Ok(())
}
