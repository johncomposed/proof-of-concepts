# Sourcenote windows (autohotkey)
Date: _04/23/2024_  
License: _MIT_  
Status: _Essential part of my life_


## Summary
I love [Sourcenote](https://www.sourcenoteapp.com/), the simple note saving tool for mac. It's a fantastic piece of software. So when I'm on my windows desktop, I seriously miss it. I haven't been able to find a tool that has the same smooth UX of just `ctrl+c` x2 to save. So I made this little autohotkey script. 

All it does is save whatever I have selected when I `ctrl+c` x2 into an [obsidian](https://obsidian.md/) vault directory (and gives a cute little notif saying that it worked). To retrieve I can just view/search through with obsidian. 

## Limitations 
Requires ahk v1.1.  
Right now I also have the vault directory hard coded in the script. Supposedly I could do something like `EnvGet, vUserProfile, USERPROFILE` and use `vUserProfile` to get a users home dir but I figure anyone who uses it will want to edit the script with their prefered obsidianvault location anyway. PRs welcome.

## Usage
1. Install [Autohotkey](https://www.autohotkey.com/). I believe I'm using v1.1. 
2. Make an obsidian vault somewhere and edit the script with the directory to it.  
3. Build the script with the autohotkey into an executable and run. 
4. Use it by select something and ctrl+c twice in quick succession to save it. 
5. Never make janky temporary notes files again. 

## Further work 
I started making a version for v2.0 of autohotkey but the language is a nightmare to work in and this works perfectly fine. So I probably never will. But if someone else does, make a PR cause I'd love to see it. 

## License
MIT

