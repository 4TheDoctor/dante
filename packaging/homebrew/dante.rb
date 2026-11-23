# Template for a future 4TheDoctor/homebrew-tap: Formula/dante.rb. Not published; fill url and sha256 on release.
class Dante < Formula
  desc "AI media concierge for Claude Code: search, debrid cache, preferences, playback"
  homepage "https://github.com/4TheDoctor/dante"
  url "https://registry.npmjs.org/@4thedoctor/dante/-/dante-0.1.0.tgz"
  sha256 "REPLACE_ON_RELEASE"
  license "MIT"

  # Keg-only on purpose: depending on plain "node" would unlink a user's node@22 and friends.
  depends_on "node@24"

  def install
    system "npm", "install", *std_npm_args
    (bin/"dante").write_env_script libexec/"bin/dante", PATH: "#{Formula["node@24"].opt_bin}:$PATH"
  end

  def caveats
    <<~EOS
      Dante needs Claude Code: https://claude.com/claude-code
      First run: dante   (asks for engines and debrid keys, creates ~/Dante)
      For putting a dub onto a better video: uv tool install git+https://github.com/4TheDoctor/audio4films
    EOS
  end

  test do
    assert_match "dante #{version}", shell_output("#{bin}/dante --version")
    ENV["DANTE_HOME"] = testpath/"Dante"
    assert_match "no engine configured", shell_output("#{bin}/dante doctor")
  end
end
